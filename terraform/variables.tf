variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-2"
}

variable "lambda_code_path" {
  description = "Path to the Lambda function source code directory"
  type        = string
  default     = "../src/lambda/customer_usage_lambda"
}

variable "bucket_name" {
  description = "S3 bucket name for CSV uploads"
  type        = string
  default     = "customer-energy-usage"
}

variable "dynamodb_usage_table" {
  description = "DynamoDB table name for usage data"
  type        = string
  default     = "Customer_usage"
}

variable "dynamodb_alerts_table" {
  description = "DynamoDB table name for threshold alerts"
  type        = string
  default     = "Customer_alerts"
}

variable "api_name" {
  description = "API Gateway REST API name"
  type        = string
  default     = "customer-usage-api"
}

variable "lambda_function_name" {
  description = "Name for the AWS Lambda function"
  type        = string
  default     = "customer-usage-lambda"
}

variable "sns_topic_name" {
  description = "SNS topic name for usage alerts"
  type        = string
  default     = "EnergyThresholdAlerts"
}

variable "schedule_lambda_code_path" {
  description = "Path to the scheduled alerts Lambda function source code directory"
  type        = string
  default     = "."
}

variable "alerts_lambda_function_name" {
  description = "Name for the scheduled alerts Lambda function"
  type        = string
  default     = "Customer_thresold_notification"
}

variable "alerts_schedule_expression" {
  description = "CloudWatch Events schedule expression for daily alerts"
  type        = string
  default     = "cron(0 0 * * ? *)"
} 