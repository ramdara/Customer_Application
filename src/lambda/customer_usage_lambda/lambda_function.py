import json
import boto3
import csv
from datetime import datetime
from collections import defaultdict
from io import StringIO
from urllib.parse import urlparse
from boto3.dynamodb.conditions import Key
from decimal import Decimal, getcontext, Inexact, Rounded
import base64

# Set decimal context to suppress Inexact and Rounded exceptions
context = getcontext()
context.traps[Inexact] = False
context.traps[Rounded] = False

dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')
table = dynamodb.Table('Customer_usage')
alerts_table = dynamodb.Table('Customer_alerts')
sns_client = boto3.client('sns')
SNS_TOPIC_ARN = 'arn:aws:sns:us-east-2:941089721988:EnergyThresholdAlerts'  # Replace with your SNS Topic ARN

UPLOAD_BUCKET = 'customer-energy-usage' 

def lambda_handler(event, context):
    method = event['httpMethod']
    path = event.get('resource', '')
    
    # CORS Preflight
    if method == 'OPTIONS':
        return cors_response(200, '')

    try:
        if method == 'POST' and path.endswith('/energy/input'):
            return handle_input(event)
        elif method == 'POST' and path.endswith('/energy/alerts'):
            return handle_set_threshold(event)
        elif method == 'GET' and path.endswith('/energy/history'):
            return handle_history(event)
        elif method == 'GET' and path.endswith('/energy/summary'):
            return handle_summary(event)
        elif method == 'GET' and path.endswith('/energy/get-presigned-url'):
            return handle_presigned_url(event)
        elif method == 'POST' and path.endswith('/energy/process-file'):
            return handle_file_process(event)
        elif method == 'GET' and path.endswith('/energy/costs'):
            return handle_costs(event)
        elif method == 'GET' and path.endswith('/energy/current-threshold'):
            return handle_current_threshold(event)
        elif method == 'POST' and path.endswith('/setup-sns'):
            return handle_setup_sns(event)
        elif method == 'POST' and path.endswith('/energy/unsubscribe-sns'):
            return handle_unsubscribe_sns(event)
        elif method == 'GET' and path.endswith('/energy/check-sns-subscription'):
            return handle_check_sns_subscription(event)
        else:
            return cors_response(404, {'error': 'Unsupported path or method'})
    except Exception as e:
        print(f"Unhandled error: {str(e)}")
        return cors_response(500, {'error': str(e)})

# Handle user input for energy usage
def handle_input(event):
    body = json.loads(event['body'])

    required_fields = ['Date', 'Usage', 'customerId', 'customerId#Date']
    if not all(field in body for field in required_fields):
        return cors_response(400, {'error': 'Missing required fields in payload'})

    item = {
        'customerId': body['customerId'],
        'Date': body['Date'],
        'Usage': body['Usage'],
        'customerId#Date': body['customerId#Date'],
    }

    table.put_item(Item=item)
    return cors_response(200, {'message': 'Energy usage submitted successfully'})

# Handle history retrieval based on date range
def handle_history(event):
    query = event.get('queryStringParameters') or {}
    start_date = query.get('startDate')
    end_date = query.get('endDate')
    customer_id = query.get('customer_id')
    
    # user_info = extract_user_info_from_token(event)
    # customer_id = user_info.get('email')
    # user_id = user_info.get('userId')

    # print(f"Customer ID: {customer_id}, User ID: {user_id}")

    if not start_date or not end_date:
        response = table.query(
            KeyConditionExpression=Key('customerId').eq(customer_id)
        )
        # return cors_response(400, {'error': 'Missing startDate or endDate'})
    else :
        start_key = f"{customer_id}#{start_date}"
        end_key = f"{customer_id}#{end_date}"

        response = table.query(
            KeyConditionExpression=Key('customerId').eq(customer_id) & Key('customerId#Date').between(start_key, end_key)
        )
        

    results = [
        {'date': item['Date'], 'usage': float(item['Usage'])}
        for item in response.get('Items', [])
    ]

    return cors_response(200, results)

# Handle summary data by period (daily, weekly, monthly)
def handle_summary(event):
    query = event.get('queryStringParameters') or {}
    period = query.get('period', 'daily')
    customer_id = query.get('customer_id')

    response = table.query(
        KeyConditionExpression=Key('customerId').eq(customer_id)
    )

    items = response.get('Items', [])

    summary = defaultdict(float)

    for item in items:
        date_str = item['Date']
        usage = float(item['Usage'])
        dt = datetime.strptime(date_str, '%Y-%m-%d')

        if period == 'monthly':
            key = dt.strftime('%Y-%m')
        elif period == 'weekly':
            key = f"{dt.strftime('%Y')}-W{dt.isocalendar()[1]}"
        else:
            key = date_str

        summary[key] += usage

    result = [{'period': k, 'usage': v} for k, v in sorted(summary.items())]

    return cors_response(200, result)

# Generate presigned URL
def handle_presigned_url(event):
    params = event.get('queryStringParameters') or {}
    customer_id = params.get('customerId')
    file_name = params.get('fileName')

    if not customer_id or not file_name:
        return cors_response(400, {'error': 'Missing customerId or fileName'})

    object_key = f"uploads/{file_name}"
    presigned_url = s3_client.generate_presigned_url(
        'put_object',
        Params={'Bucket': UPLOAD_BUCKET, 'Key': object_key, 'ContentType': 'text/csv'},
        ExpiresIn=900  # 15 minutes
    )

    file_url = f"https://{UPLOAD_BUCKET}.s3.amazonaws.com/{object_key}"

    return cors_response(200, {
        'presignedUrl': presigned_url,
        'fileUrl': file_url
    })

def handle_set_threshold(event):
    body = json.loads(event['body'])
    customer_id = body.get('customerId')
    threshold   = body.get('threshold')

    if not customer_id or threshold is None:
        return cors_response(400, {'error': 'Missing customerId or threshold'})

    # Store or update threshold
    alerts_table.put_item(Item={
        'customerId': customer_id,
        'updatedAt':datetime.utcnow().isoformat(),
        'threshold' : Decimal(str(threshold))
    })

    return cors_response(200, {'message': 'Threshold set successfully'})

def handle_costs(event):
    query = event.get('queryStringParameters') or {}
    customer_id = query.get('customer_id')

    if not customer_id:
        return cors_response(400, {'error': 'Missing customer_id'})

    response = table.query(
        KeyConditionExpression=Key('customerId').eq(customer_id)
    )

    items = response.get('Items', [])
    if not items:
        return cors_response(200, [])

    # Constants
    RATE_PER_KWH = Decimal('5')  # Example: $0.12 per kWh
    today = datetime.utcnow()
    current_month = today.strftime('%Y-%m')

    # Group by month and sum usage
    usage_by_month = defaultdict(Decimal)
    for item in items:
        date_str = item['Date']
        usage = Decimal(item['Usage'])  # Already stored as Decimal
        dt = datetime.strptime(date_str, '%Y-%m-%d')
        month_key = dt.strftime('%Y-%m')
        usage_by_month[month_key] += usage

    # Convert to cost format
    result = []
    for month, usage in sorted(usage_by_month.items()):
        cost = usage * RATE_PER_KWH
        result.append({
            'month': month,
            'cost': float(round(cost, 2)),
            'estimated': month == current_month
        })

    return cors_response(200, result)

# Process the uploaded file
def handle_file_process(event):
    body = json.loads(event['body'])
    file_url = body.get('fileUrl')
    customer_id = body.get('customerId')

    if not file_url or not customer_id:
        return cors_response(400, {'error': 'Missing fileUrl or customerId'})

    try:
        parsed = urlparse(file_url)
        bucket_name = parsed.netloc.split('.')[0]
        object_key = parsed.path.lstrip('/')

        s3_response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
        csv_content = s3_response['Body'].read().decode('utf-8')
        csv_reader = csv.reader(StringIO(csv_content), delimiter=',')

        headers = next(csv_reader)
        if headers != ['Date', 'Usage']:
            return cors_response(400, {'error': 'CSV must have headers: Date,Usage'})

        for row in csv_reader:
            date_str, usage_str = row
            usage = Decimal(usage_str)
            item = {
                'customerId': customer_id,
                'Date': date_str,
                'Usage': usage,
                'customerId#Date': f"{customer_id}#{date_str}",
            }
            table.put_item(Item=item)

        return cors_response(200, {'message': 'File processed and data stored successfully!'})

    except Exception as e:
        print(f"File processing error: {str(e)}")
        return cors_response(500, {'error': f'File processing failed: {str(e)}'})

def handle_current_threshold(event):
    query = event.get('queryStringParameters') or {}
    customer_id = query.get('customer_id')

    if not customer_id:
        return cors_response(400, {'error': 'Missing customer_id'})

    try:
        response = alerts_table.get_item(Key={'customerId': customer_id})
        item = response.get('Item')

        if not item:
            # Return a default threshold value or a specific message
            return cors_response(200, {'threshold': None, 'message': 'No threshold set for this user'})

        return cors_response(200, {'threshold': float(item['threshold'])})
    except Exception as e:
        print(f"Error fetching current threshold: {str(e)}")
        return cors_response(500, {'error': f'Failed to fetch current threshold: {str(e)}'})

def handle_setup_sns(event):
    body = json.loads(event['body'])
    email = body.get('email')

    if not email:
        return cors_response(400, {'error': 'Missing email'})

    try:
        response = sns_client.subscribe(
            TopicArn=SNS_TOPIC_ARN,
            Protocol='email',
            Endpoint=email
        )
        return cors_response(200, {'message': 'SNS subscription set up successfully', 'SubscriptionArn': response['SubscriptionArn']})
    except Exception as e:
        print(f"SNS subscription error: {str(e)}")
        return cors_response(500, {'error': f'SNS subscription failed: {str(e)}'})

def handle_unsubscribe_sns(event):
    body = json.loads(event['body'])
    email = body.get('email')

    if not email:
        return cors_response(400, {'error': 'Missing email'})

    try:
        response = sns_client.list_subscriptions_by_topic(TopicArn=SNS_TOPIC_ARN)
        subscriptions = response.get('Subscriptions', [])

        # Find the subscription with the matching email
        subscription_arn = next((sub['SubscriptionArn'] for sub in subscriptions if sub['Endpoint'] == email), None)
        print(f"Subscription ARN: {subscription_arn}")
        if not subscription_arn:
            return cors_response(404, {'error': 'Subscription not found'})

        sns_client.unsubscribe(SubscriptionArn=subscription_arn)
        return cors_response(200, {'message': 'Unsubscribed from SNS successfully'})
    except Exception as e:
        print(f"SNS unsubscription error: {str(e)}")
        return cors_response(500, {'error': f'SNS unsubscription failed: {str(e)}'})

def handle_check_sns_subscription(event):
    query = event.get('queryStringParameters') or {}
    email = query.get('email')

    if not email:
        return cors_response(400, {'error': 'Missing email'})

    try:
        response = sns_client.list_subscriptions_by_topic(TopicArn=SNS_TOPIC_ARN)
        subscriptions = response.get('Subscriptions', [])
        print(subscriptions)
        is_subscribed = any(sub['Endpoint'] == email and sub['SubscriptionArn'] != 'PendingConfirmation' for sub in subscriptions)

        return cors_response(200, {'isSubscribed': is_subscribed})
    except Exception as e:
        print(f"SNS subscription check error: {str(e)}")
        return cors_response(500, {'error': f'SNS subscription check failed: {str(e)}'})

def extract_user_info_from_token(event):
    try:
        print(f"Event: {event}")
        auth_header = event.get('headers', {}).get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            raise ValueError('Missing or invalid Authorization header')

        token = auth_header.split(' ')[1]
        token_parts = token.split('.')
        if len(token_parts) != 3:
            raise ValueError('Invalid JWT token format')

        payload_part = token_parts[1]
        # Pad base64 if needed
        padded_payload = payload_part + '=' * (-len(payload_part) % 4)
        decoded_bytes = base64.urlsafe_b64decode(padded_payload)
        payload = json.loads(decoded_bytes.decode('utf-8'))

        return {
            'email': payload.get('email'),
            'userId': payload.get('sub')
        }

    except Exception as e:
        print(f"Token decoding error: {str(e)}")
        raise Exception('Invalid or malformed token')



# Utility function to send CORS-enabled responses
def cors_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
        },
        'body': json.dumps(body)
    }
