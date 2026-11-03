from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


class Settings(BaseSettings):
    database_url: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    speed_limit_kmh: float = 60.0
    media_root: str = "./media"
    cors_origins: str
    redis_host: str = "localhost"
    redis_port: int = 6379

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self):
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
for sub in ("screenshots", "plates", "videos"):
    Path(settings.media_root, sub).mkdir(parents=True, exist_ok=True)
