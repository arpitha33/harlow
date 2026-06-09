"""
Central config. Loads your secret key once and creates a single Groq client
that the whole backend shares. Imported by every other file.
"""
import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()  # reads the .env file in this folder

if "GROQ_API_KEY" not in os.environ:
    raise RuntimeError(
        "No GROQ_API_KEY found. Copy .env.example to .env and paste your key."
    )

client = Groq(api_key=os.environ["GROQ_API_KEY"])

# Two models on purpose:
# - BIG handles in-character dialogue, where subtlety matters.
# - SMALL handles the cheap structured jobs (classify intent, evaluate state).
#   Using the fast 8B for those keeps you well under the free-tier rate limit.
BIG_MODEL = "llama-3.3-70b-versatile"
SMALL_MODEL = "llama-3.1-8b-instant"