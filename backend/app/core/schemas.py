from pydantic import BaseModel


class RegisterRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterResponse(BaseModel):
    id: str
    email: str
    role: str


class TokenPayload(BaseModel):
    sub: str   # user_id — el proxy construye synapse_user_{sub}
    role: str
    exp: int
