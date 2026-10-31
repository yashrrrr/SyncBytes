# -------------------------------------------------------------
# Amazon S3: Document Snapshots and Media Storage
# -------------------------------------------------------------
resource "aws_s3_bucket" "snapshots" {
  bucket        = "${var.project_name}-snapshots-${random_id.suffix.hex}"
  force_destroy = false

  tags = {
    Name = "${var.project_name}-snapshots"
  }
}

resource "aws_s3_bucket_versioning" "snapshots" {
  bucket = aws_s3_bucket.snapshots.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "snapshots" {
  bucket = aws_s3_bucket.snapshots.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
