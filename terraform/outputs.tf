// Outputs for deployed resources

output "s3_bucket_name" {
  description = "Name of the S3 bucket for CSV uploads"
  value       = aws_s3_bucket.uploads.id
}

output "dynamodb_usage_table_name" {
  description = "DynamoDB table name for energy usage data"
  value       = aws_dynamodb_table.usage.name
}

output "dynamodb_alerts_table_name" {
  description = "DynamoDB table name for threshold alerts"
  value       = aws_dynamodb_table.alerts.name
}

output "sns_topic_arn" {
  description = "SNS topic ARN for usage alerts"
  value       = aws_sns_topic.alerts.arn
}

output "lambda_function_arn" {
  description = "ARN of the Lambda function handling requests"
  value       = aws_lambda_function.usage_lambda.arn
}

output "api_gateway_endpoint" {
  description = "Invoke URL for the API Gateway prod stage"
  value       = "https://${aws_api_gateway_rest_api.api.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_api_gateway_deployment.deployment.stage_name}"
} 