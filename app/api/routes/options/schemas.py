from pydantic import BaseModel, Field

class OptionsBase(BaseModel):
    audio_enabled: bool = True
    speech_enabled: bool = True
    alarm_sound: str = Field(default="gong1.mp3", min_length=1, max_length=200)
    speech_language: str = Field(default="de-DE", min_length=2, max_length=50)
    weather_location: str = Field(default="", max_length=200)

class OptionsOut(OptionsBase):
    id: int

    class Config:
        from_attributes = True

class OptionsUpdate(BaseModel):
    audio_enabled: bool | None = None
    speech_enabled: bool | None = None
    alarm_sound: str | None = None
    speech_language: str | None = None
    weather_location: str | None = None
