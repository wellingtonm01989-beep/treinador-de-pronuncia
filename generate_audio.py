import asyncio
import edge_tts
import os

# Defina a voz que será usada
VOICE = "en-US-GuyNeural"
OUTPUT_DIR = "audios"

# Lista de palavras que precisam de áudio gerado
words_to_generate = [
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "I",
    "it", "for", "not", "on", "with", "he", "as", "you", "do", "at"
    # Adicione mais palavras do banco de dados aqui conforme necessário
]

async def generate_audio(word):
    # O arquivo será salvo com o nome da palavra (ex: the.mp3)
    output_file = os.path.join(OUTPUT_DIR, f"{word.lower()}.mp3")
    
    if os.path.exists(output_file):
        print(f"Pulando '{word}' - arquivo já existe.")
        return
        
    print(f"Gerando áudio para '{word}'...")
    communicate = edge_tts.Communicate(word, VOICE)
    
    try:
        await communicate.save(output_file)
        print(f"Salvo: {output_file}")
    except Exception as e:
        print(f"Erro ao gerar '{word}': {e}")

async def main():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        
    for word in words_to_generate:
        await generate_audio(word)
        
    print("\nGeração concluída!")

if __name__ == "__main__":
    # Comando para instalar a biblioteca: pip install edge-tts
    asyncio.run(main())
