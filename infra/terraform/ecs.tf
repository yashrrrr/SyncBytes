# -------------------------------------------------------------
# Amazon ECR: Container Registries for Web & Sync Server
# -------------------------------------------------------------
resource "aws_ecr_repository" "web" {
  name                 = "${var.project_name}-web"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "sync_server" {
  name                 = "${var.project_name}-sync-server"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# -------------------------------------------------------------
# Amazon ECS Cluster: Fargate Spot (70% Discount / Scale-to-Zero)
# -------------------------------------------------------------
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE_SPOT", "FARGATE"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }
}

# -------------------------------------------------------------
# Security Groups: Direct Internet Ingress (No ALB)
# -------------------------------------------------------------
resource "aws_security_group" "caddy_ingress" {
  name        = "${var.project_name}-caddy-sg"
  description = "Allows HTTP/HTTPS and WSS ingress"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS & WSS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-caddy-sg"
  }
}

# -------------------------------------------------------------
# IAM Roles for ECS Tasks
# -------------------------------------------------------------
resource "aws_iam_role" "ecs_execution_role" {
  name = "${var.project_name}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task_role" {
  name = "${var.project_name}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# Custom policy for sync server to access DynamoDB, SQS, and S3
resource "aws_iam_policy" "sync_server_policy" {
  name        = "${var.project_name}-sync-policy"
  description = "Permissions for Sync Server to read/write DynamoDB deltas, S3 snapshots, and publish to SQS"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
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
      },
      {
        Sid    = "SQSSendAccess"
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:GetQueueUrl"
        ]
        Resource = aws_sqs_queue.compaction.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "sync_server" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.sync_server_policy.arn
}
