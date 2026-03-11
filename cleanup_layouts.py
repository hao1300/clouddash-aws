import os
import shutil

files_to_delete = [
    r"c:\CS\aws-console\src\routes\cloudformation\+layout.ts",
    r"c:\CS\aws-console\src\routes\cloudfront\+layout.ts",
    r"c:\CS\aws-console\src\routes\cloudwatch\+layout.ts",
    r"c:\CS\aws-console\src\routes\dynamodb\+layout.ts",
    r"c:\CS\aws-console\src\routes\ec2\+layout.ts",
    r"c:\CS\aws-console\src\routes\elasticbeanstalk\+layout.ts",
    r"c:\CS\aws-console\src\routes\iam\+layout.ts",
    r"c:\CS\aws-console\src\routes\lambda\+layout.ts",
    r"c:\CS\aws-console\src\routes\s3\+layout.ts",
    r"c:\CS\aws-console\src\routes\secretsmanager\+layout.ts",
    r"c:\CS\aws-console\src\routes\ses\+layout.ts",
    r"c:\CS\aws-console\src\routes\sns\+layout.ts",
    r"c:\CS\aws-console\src\routes\sqs\+layout.ts",
    r"c:\CS\aws-console\src\routes\stepfunctions\+layout.ts"
]

dirs_to_delete = [
    r"c:\CS\aws-console\src\routes\cloudwatch\dashboards"
]

for f in files_to_delete:
    if os.path.exists(f):
        try:
            os.remove(f)
            print(f"Deleted file: {f}")
        except Exception as e:
            print(f"Error deleting file {f}: {e}")

for d in dirs_to_delete:
    if os.path.exists(d):
        try:
            shutil.rmtree(d)
            print(f"Deleted directory: {d}")
        except Exception as e:
            print(f"Error deleting directory {d}: {e}")
