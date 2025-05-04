import boto3
from datetime import datetime, timedelta
from boto3.dynamodb.conditions import Key
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
sns = boto3.client('sns')

USAGE_TABLE_NAME = 'Customer_usage'
ALERTS_TABLE_NAME = 'Customer_alerts'
SNS_TOPIC_ARN = 'arn:aws:sns:us-east-2:941089721988:EnergyThresholdAlerts'  # Replace with your actual ARN

usage_table = dynamodb.Table(USAGE_TABLE_NAME)
alerts_table = dynamodb.Table(ALERTS_TABLE_NAME)

def lambda_handler(event, context):
    yesterday = (datetime.utcnow() - timedelta(days=1)).strftime('%Y-%m-%d')

    # Scan for all alerts
    alerts_response = alerts_table.scan()
    alerts = alerts_response.get('Items', [])

    alerts_sent = []

    for alert in alerts:
        customer_id = alert['customerId']
        threshold = Decimal(str(alert['threshold']))

        usage_key = f"{customer_id}#{yesterday}"

        usage_response = usage_table.get_item(
            Key={
                'customerId': customer_id,
                'customerId#Date': usage_key
            }
        )

        item = usage_response.get('Item')
        if item and Decimal(str(item['Usage'])) > threshold:
            message = (
                f"Alert: Your energy usage for {yesterday} was {item['Usage']} kWh, "
                f"which exceeds your threshold of {threshold} kWh."
            )

            # Send SNS notification
            sns.publish(
                TopicArn=SNS_TOPIC_ARN,
                Subject='Energy Usage Alert',
                Message=message
            )

            alerts_sent.append(customer_id)

    return {
        'statusCode': 200,
        'body': f'Alerts sent to {len(alerts_sent)} customers: {alerts_sent}'
    }
