from pydantic import BaseModel, Field, field_validator

from app.core.security import EMAIL_PATTERN, normalize_email


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _normalize(cls, v: str) -> str:
        return normalize_email(v)


class CreateUserRequest(BaseModel):
    email: str
    password: str = Field(min_length=1)

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        v = normalize_email(v)
        if not EMAIL_PATTERN.match(v):
            raise ValueError("Formato de email inválido")
        return v


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
