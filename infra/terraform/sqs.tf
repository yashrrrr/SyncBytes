# -------------------------------------------------------------
# Amazon SQS: Compaction Job Queue (Always Free 1M Requests)
# -------------------------------------------------------------
resource "aws_sqs_queue" "compaction_dlq" {
  name                      = "${var.project_name}-compaction-dlq"
  message_retention_seconds = 1209600 # 14 days
}

resource "aws_sqs_queue" "compaction" {
  name                       = "${var.project_name}-compaction-queue"
  visibility_timeout_seconds = 300   # 5 minutes for Lambda compaction
  message_retention_seconds  = 86400 # 1 day

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.compaction_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "${var.project_name}-compaction-queue"
  }
}
