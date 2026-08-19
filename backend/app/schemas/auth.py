from pydantic import BaseModel
from typing import Optional

class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    picture: Optional[str] = None
