import chromadb
client = chromadb.PersistentClient(path="./chroma_data")

def get_collection(session_id):
    # one separate memory box per playthrough
    return client.get_or_create_collection(name=f"play_{session_id}")

def remember(session_id, character, text, turn):
    col = get_collection(session_id)
    col.add(documents=[text],
            metadatas=[{"character": character}],
            ids=[f"{character}_{turn}"])

def recall(session_id, character, query, k=3):
    col = get_collection(session_id)
    res = col.query(query_texts=[query], n_results=k,
                    where={"character": character})
    return res["documents"][0]  # list of relevant past lines