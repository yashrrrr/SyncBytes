output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_id" {
  description = "Public subnet ID"
  value       = aws_subnet.public.id
}

output "dynamodb_table_name" {
  description = "DynamoDB deltas table name"
  value       = aws_dynamodb_table.deltas.name
}

output "s3_bucket_name" {
  description = "S3 snapshots bucket name"
  value       = aws_s3_bucket.snapshots.bucket
}

output "sqs_compaction_queue_url" {
  description = "SQS compaction queue URL"
  value       = aws_sqs_queue.compaction.url
}

output "ecr_web_url" {
  description = "ECR repository URL for Next.js web container"
  value       = aws_ecr_repository.web.repository_url
}

output "ecr_sync_server_url" {
  description = "ECR repository URL for WebSocket sync server"
  value       = aws_ecr_repository.sync_server.repository_url
}
