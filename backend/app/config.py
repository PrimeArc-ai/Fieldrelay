from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    fieldrelay_env: str = "poc"
    database_url: str = "sqlite:///./backend/data/fieldrelay.db"
    cors_origins: str = "http://localhost:3000"
    supported_zips: str = "560001,560002,560003,560004"
    vapi_private_key: str = ""
    vapi_public_key: str = ""
    vapi_webhook_secret: str = ""
    vapi_assistant_id: str = ""

    @property
    def zip_allowlist(self) -> set[str]:
        return {item.strip() for item in self.supported_zips.split(",") if item.strip()}

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
