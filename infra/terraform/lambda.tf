# -------------------------------------------------------------
# AWS Lambda: Asynchronous Compaction Worker (Always Free Tier)
# -------------------------------------------------------------
resource "aws_iam_role" "lambda_compactor_role" {
  name = "${var.project_name}-lambda-compactor-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_compactor_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "lambda_compactor_policy" {
  name        = "${var.project_name}-lambda-compactor-policy"
  description = "Permissions for Lambda to read/delete DynamoDB deltas, read/write S3 snapshots, and poll SQS"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SQSPollAccess"
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.compaction.arn
      },
      {
        Sid    = "DynamoDBDeltaAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:DeleteItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          aws_dynamodb_table.deltas.arn,
          "${aws_dynamodb_table.deltas.arn}/*"
        ]
      },
      {
        Sid    = "S3SnapshotAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = "${aws_s3_bucket.snapshots.arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_compactor" {
  role       = aws_iam_role.lambda_compactor_role.name
  policy_arn = aws_iam_policy.lambda_compactor_policy.arn
}

# Dummy archive for initial terraform deployment before code is built
data "archive_file" "dummy_lambda" {
  type        = "zip"
  output_path = "${path.module}/dummy_lambda.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: 'init' });"
    filename = "index.js"
  }
}

resource "aws_lambda_function" "compactor" {
  function_name    = "${var.project_name}-compactor"
  role             = aws_iam_role.lambda_compactor_role.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.dummy_lambda.output_path
  source_code_hash = data.archive_file.dummy_lambda.output_base64sha256
  memory_size      = 256
  timeout          = 60

  environment {
    variables = {
      DYNAMODB_TABLE_NAME                 = aws_dynamodb_table.deltas.name
      S3_BUCKET_NAME                      = aws_s3_bucket.snapshots.bucket
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    }
  }

  tags = {
    Name = "${var.project_name}-compactor"
  }
}

resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn = aws_sqs_queue.compaction.arn
  function_name    = aws_lambda_function.compactor.arn
  batch_size       = 10
  enabled          = true
}
