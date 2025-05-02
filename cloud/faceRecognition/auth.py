from fastapi import Security, HTTPException, status
from fastapi.security import APIKeyHeader


api_key_header = APIKeyHeader(name="X-API-Key")
my_api_key = "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

def check_api_key(api_key_header: str = Security(api_key_header)):
    if my_api_key == api_key_header:
        return True
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing or invalid API key"
    )
