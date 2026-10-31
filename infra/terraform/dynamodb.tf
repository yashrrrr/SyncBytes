# -------------------------------------------------------------
# DynamoDB: Append-Only Delta Log (AWS Always Free Tier: 25GB)
# -------------------------------------------------------------
resource "aws_dynamodb_table" "deltas" {
  name         = "${var.project_name}-document-deltas"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "document_id"
  range_key    = "version_seq"

  attribute {
    name = "document_id"
    type = "S"
  }

  attribute {
    name = "version_seq"
    type = "N"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-deltas"
  }
}
