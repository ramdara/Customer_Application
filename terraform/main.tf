// Terraform resources for S3, DynamoDB, SNS, IAM, Lambda, and API Gateway

// Package the Lambda code
 data "archive_file" "lambda_zip" {
   type        = "zip"
   source_dir  = var.lambda_code_path
   output_path = "${path.module}/lambda.zip"
 }

// S3 bucket for CSV uploads
 resource "aws_s3_bucket" "uploads" {
   bucket = var.bucket_name
   acl    = "private"
 }

// DynamoDB table for energy usage data
 resource "aws_dynamodb_table" "usage" {
   name         = var.dynamodb_usage_table
   billing_mode = "PAY_PER_REQUEST"
   hash_key     = "customerId"
   range_key    = "customerId#Date"

   attribute {
     name = "customerId"
     type = "S"
   }
   attribute {
     name = "customerId#Date"
     type = "S"
   }
   attribute {
    name = "Date"
    type = "S"
  }
  attribute {
    name = "Usage"
    type = "N"
  }
 }

// DynamoDB table for alerts
 resource "aws_dynamodb_table" "alerts" {
   name         = var.dynamodb_alerts_table
   billing_mode = "PAY_PER_REQUEST"
   hash_key     = "customerId"

   attribute {
     name = "customerId"
     type = "S"
   }
  attribute {
    name = "threshold"
    type = "N"
  }
  attribute {
    name = "UpdatedAt"
    type = "S"
  }
 }

// SNS topic for threshold alerts
 resource "aws_sns_topic" "alerts" {
   name       = var.sns_topic_name
   fifo_topic = false  # explicitly define as a standard (non-FIFO) topic
 }

// IAM role for Lambda execution
 data "aws_iam_policy_document" "lambda_assume_role_policy" {
   statement {
     actions = ["sts:AssumeRole"]
     principals {
       type        = "Service"
       identifiers = ["lambda.amazonaws.com"]
     }
   }
 }
 resource "aws_iam_role" "lambda_exec" {
   name               = "${var.lambda_function_name}-exec-role"
   assume_role_policy = data.aws_iam_policy_document.lambda_assume_role_policy.json
 }

// Inline policy granting S3, DynamoDB, and SNS access
 data "aws_iam_policy_document" "lambda_policy_document" {
   statement {
     actions   = ["s3:PutObject", "s3:GetObject"]
     resources = [aws_s3_bucket.uploads.arn, "${aws_s3_bucket.uploads.arn}/*"]
   }
   statement {
     actions   = ["dynamodb:Query", "dynamodb:PutItem", "dynamodb:GetItem"]
     resources = [aws_dynamodb_table.usage.arn, aws_dynamodb_table.alerts.arn]
   }
   statement {
     actions   = ["sns:Publish"]
     resources = [aws_sns_topic.alerts.arn]
   }
   statement {
     actions   = ["sns:Subscribe", "sns:ListSubscriptionsByTopic", "sns:Unsubscribe"]
     resources = [aws_sns_topic.alerts.arn]
   }
 }
 resource "aws_iam_role_policy" "lambda_policy" {
   name   = "${var.lambda_function_name}-policy"
   role   = aws_iam_role.lambda_exec.id
   policy = data.aws_iam_policy_document.lambda_policy_document.json
 }

// Lambda function resource
 resource "aws_lambda_function" "usage_lambda" {
   function_name    = var.lambda_function_name
   filename         = "${path.module}/customer_usage.zip"
   source_code_hash = data.archive_file.lambda_zip.output_base64sha256
   handler          = "lambda_function.lambda_handler"
   runtime          = "python3.9"
   role             = aws_iam_role.lambda_exec.arn

   environment {
     variables = {
       UPLOAD_BUCKET    = var.bucket_name
       USAGE_TABLE      = var.dynamodb_usage_table
       ALERTS_TABLE     = var.dynamodb_alerts_table
       SNS_TOPIC_ARN    = aws_sns_topic.alerts.arn
     }
   }
 }

// API Gateway REST API
 resource "aws_api_gateway_rest_api" "api" {
   name        = var.api_name
   description = "Customer Usage API"
 }

// 'energy' resource under root
 resource "aws_api_gateway_resource" "energy" {
   rest_api_id = aws_api_gateway_rest_api.api.id
   parent_id   = aws_api_gateway_rest_api.api.root_resource_id
   path_part   = "energy"
 }

// ANY method on /energy
 resource "aws_api_gateway_method" "energy_any" {
   rest_api_id   = aws_api_gateway_rest_api.api.id
   resource_id   = aws_api_gateway_resource.energy.id
   http_method   = "ANY"
   authorization = "NONE"
 }

// Integration of API Gateway with Lambda
 resource "aws_api_gateway_integration" "energy_lambda" {
   rest_api_id             = aws_api_gateway_rest_api.api.id
   resource_id             = aws_api_gateway_resource.energy.id
   http_method             = aws_api_gateway_method.energy_any.http_method
   integration_http_method = "POST"
   type                    = "AWS_PROXY"
   uri                     = aws_lambda_function.usage_lambda.invoke_arn
 }

// Grant API Gateway permission to invoke Lambda
 resource "aws_lambda_permission" "api_gw_lambda" {
   statement_id  = "AllowAPIGatewayInvoke"
   action        = "lambda:InvokeFunction"
   function_name = aws_lambda_function.usage_lambda.function_name
   principal     = "apigateway.amazonaws.com"
   source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
 }

// Deploy the API to a "prod" stage
 resource "aws_api_gateway_deployment" "deployment" {
   depends_on = [aws_api_gateway_integration.energy_lambda]
   rest_api_id = aws_api_gateway_rest_api.api.id
   stage_name  = "prod"
 }

// CloudWatch Log Group for main Lambda function
resource "aws_cloudwatch_log_group" "usage_lambda_logs" {
  name              = "/aws/lambda/${aws_lambda_function.usage_lambda.function_name}"
  retention_in_days = 14 # placeholder: adjust log retention days as needed
}

// Package the scheduled alerts Lambda function
data "archive_file" "schedule_lambda_zip" {
  type        = "zip"
  source_dir  = var.schedule_lambda_code_path # placeholder: update path to scheduled Lambda code
  output_path = "${path.module}/schedule_lambda.zip"
}

// Scheduled alerts Lambda function triggered daily
resource "aws_lambda_function" "daily_alerts_lambda" {
  function_name    = var.alerts_lambda_function_name # placeholder: update function name if desired
  filename         = "${path.module}/Customer_thresold_notification.zip"
  source_code_hash = data.archive_file.schedule_lambda_zip.output_base64sha256
  handler          = "lambda_function.lambda_handler" # placeholder: update handler as per code
  runtime          = "python3.9"
  role             = aws_iam_role.lambda_exec.arn

  environment {
    variables = {
      USAGE_TABLE   = var.dynamodb_usage_table
      ALERTS_TABLE  = var.dynamodb_alerts_table
      SNS_TOPIC_ARN = aws_sns_topic.alerts.arn
    }
  }
}

// CloudWatch EventBridge rule for scheduling daily alerts Lambda
resource "aws_cloudwatch_event_rule" "daily_alerts" {
  name                = "${var.alerts_lambda_function_name}-schedule"
  description         = "Schedule to trigger daily alerts Lambda"
  schedule_expression = var.alerts_schedule_expression # placeholder: adjust schedule expression
}
resource "aws_cloudwatch_event_target" "daily_alerts_target" {
  rule      = aws_cloudwatch_event_rule.daily_alerts.name
  target_id = "dailyAlertsLambda"
  arn       = aws_lambda_function.daily_alerts_lambda.arn
}
resource "aws_lambda_permission" "allow_eventbridge_invoke" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.daily_alerts_lambda.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_alerts.arn
}

// Catch-all proxy for all /energy/* API paths
resource "aws_api_gateway_resource" "energy_proxy" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.energy.id
  path_part   = "{proxy+}" # catches all subpaths under /energy
}
resource "aws_api_gateway_method" "energy_proxy_any" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.energy_proxy.id
  http_method   = "ANY"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "energy_proxy_integration" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.energy_proxy.id
  http_method             = aws_api_gateway_method.energy_proxy_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.usage_lambda.invoke_arn
}
resource "aws_lambda_permission" "api_gw_proxy_lambda" {
  statement_id  = "AllowAPIGatewayProxyInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.usage_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/energy/*"
}

// Define individual endpoints under /energy
locals {
  energy_endpoints = {
    alerts                    = "POST"
    "check-sns-subscription" = "GET"
    costs                     = "GET"
    "current-threshold"      = "GET"
    "get-presigned-url"      = "GET"
    history                   = "GET"
    input                     = "POST"
    "process-file"           = "POST"
    "setup-sns"              = "POST"
    "unsubscribe-sns"        = "POST"
    summary                   = "GET"
    upload                    = "POST"
  }
}

// Create a resource for each endpoint
resource "aws_api_gateway_resource" "energy_sub" {
  for_each    = local.energy_endpoints
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.energy.id
  path_part   = each.key
}

// Create a method for each sub-resource
resource "aws_api_gateway_method" "energy_sub_method" {
  for_each      = local.energy_endpoints
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.energy_sub[each.key].id
  http_method   = each.value
  authorization = "NONE"
}

// Integrate each sub-resource with the Lambda using AWS_PROXY
resource "aws_api_gateway_integration" "energy_sub_integration" {
  for_each                 = local.energy_endpoints
  rest_api_id              = aws_api_gateway_rest_api.api.id
  resource_id              = aws_api_gateway_resource.energy_sub[each.key].id
  http_method              = aws_api_gateway_method.energy_sub_method[each.key].http_method
  integration_http_method  = "POST"
  type                     = "AWS_PROXY"
  uri                      = aws_lambda_function.usage_lambda.invoke_arn
}

// Grant API Gateway permission to invoke Lambda for each endpoint
resource "aws_lambda_permission" "energy_sub_permission" {
  for_each      = local.energy_endpoints
  statement_id  = "AllowInvoke_${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.usage_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/${each.value}/${each.key}"
} 