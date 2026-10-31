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

  ingress {
    description = "Direct Web (Debug)"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Direct Sync Server (Debug)"
    from_port   = 4000
    to_port     = 4000
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

# -------------------------------------------------------------
# CloudWatch Logs for ECS Containers
# -------------------------------------------------------------
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.project_name}"
  retention_in_days = 7

  tags = {
    Name = "${var.project_name}-ecs-logs"
  }
}

# -------------------------------------------------------------
# ECS Task Definition: Web + Sync-Server + Caddy Reverse Proxy
# -------------------------------------------------------------
resource "aws_ecs_task_definition" "app" {
  family                   = "${var.project_name}-app"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "sync-server"
      image     = "${aws_ecr_repository.sync_server.repository_url}:latest"
      essential = true
      portMappings = [
        {
          containerPort = 4000
          hostPort      = 4000
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "4000" },
        { name = "HOST", value = "0.0.0.0" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "DYNAMODB_TABLE_NAME", value = aws_dynamodb_table.deltas.name },
        { name = "S3_BUCKET_NAME", value = aws_s3_bucket.snapshots.bucket },
        { name = "SQS_QUEUE_URL", value = aws_sqs_queue.compaction.url },
        { name = "COMPACTION_DELTA_THRESHOLD", value = "50" },
        { name = "DEBOUNCE_FLUSH_MS", value = "500" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "sync-server"
        }
      }
    },
    {
      name      = "web"
      image     = "${aws_ecr_repository.web.repository_url}:latest"
      essential = true
      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "3000" },
        { name = "HOSTNAME", value = "0.0.0.0" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "web"
        }
      }
    },
    {
      name      = "caddy"
      image     = "caddy:2.8-alpine"
      essential = true
      entryPoint = [
        "sh",
        "-c"
      ]
      command = [
        "printf '${var.domain_name} {\\n  handle /ws* {\\n    reverse_proxy 127.0.0.1:4000\\n  }\\n  handle {\\n    reverse_proxy 127.0.0.1:3000\\n  }\\n}\\n' > /etc/caddy/Caddyfile && caddy run --config /etc/caddy/Caddyfile"
      ]
      portMappings = [
        {
          containerPort = 80
          hostPort      = 80
          protocol      = "tcp"
        },
        {
          containerPort = 443
          hostPort      = 443
          protocol      = "tcp"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "caddy"
        }
      }
    }
  ])
}

# -------------------------------------------------------------
# ECS Service: Runs on Fargate Spot
# -------------------------------------------------------------
resource "aws_ecs_service" "app" {
  name            = "${var.project_name}-app-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }

  network_configuration {
    subnets          = [aws_subnet.public.id]
    security_groups  = [aws_security_group.caddy_ingress.id]
    assign_public_ip = true
  }

  lifecycle {
    ignore_changes = [task_definition]
  }
}
