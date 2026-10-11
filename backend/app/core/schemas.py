from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str
    password: str


class CreateUserRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)


class UserResponse(BaseModel):
    id: str
    email: str
    role: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class TokenPayload(BaseModel):
    sub: str   # user_id — el proxy construye synapse_user_{sub}
    role: str
    exp: int
