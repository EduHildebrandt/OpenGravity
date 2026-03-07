# OpenGravity 🪐

¡Hola! Bienvenido a **OpenGravity**, tu Asistente de Inteligencia Artificial personal a través de Telegram.

Este documento está escrito de forma súper sencilla para que cualquier persona, sepa o no programar, entienda cómo está construido el proyecto, qué hace cada pieza y cómo ponerlo a funcionar.

---

## 🧠 ¿Qué es OpenGravity?

OpenGravity es un "bot" (o robot conversacional) que vive dentro de Telegram. A diferencia de un bot tradicional que solo responde a comandos fijos o tiene respuestas pre-programadas, OpenGravity tiene un "cerebro" conectado a modelos de Inteligencia Artificial muy avanzados (como los de Google o Groq).

Esto significa que puedes conversar con él de forma natural, pedirle que te ayude con tareas, y lo más importante: **tiene memoria** y **usa herramientas**.

### ✨ Características Principales
1. **Totalmente Privado y Seguro:** El bot está configurado para hablar *únicamente* con las personas que tú autorices (a través de una "lista blanca" de IDs de Telegram).
2. **Memoria Infinita (Firebase):** OpenGravity recuerda tus conversaciones pasadas. Todo el historial se guarda de manera segura en la nube usando Firebase Firestore.
3. **Múltiples Cerebros (Modelos de IA):** Puedes elegir qué motor de Inteligencia Artificial usa tu bot (Groq, Google Gemini, o OpenRouter).
4. **Uso de Herramientas (Skills):** El bot tiene la capacidad de "hacer cosas" en el mundo real. Por ejemplo, puede usar la herramienta de "reloj" para saber qué hora es exactamente antes de contestarte.

---

## 🏗️ ¿Cómo funciona por dentro? (Arquitectura sencilla)

Imagina a OpenGravity como un pequeño cuerpo con diferentes órganos, cada uno haciendo un trabajo específico. Todo el código vive dentro de la carpeta `src/` (source = código fuente):

* 👁️ **El Rostro y los Oídos (`src/bot/`)**: Es la conexión con Telegram. Se encarga de recibir los mensajes que le envías desde tu celular, verificar que seas tú (seguridad), y enviarte de vuelta la respuesta terminada.
* ⚙️ **El Motor Principal (`src/agent/loop.ts`)**: Es quien dirige la orquesta. Recibe tu mensaje, se lo pasa a la IA, y revisa si la IA necesita usar alguna herramienta. Si la necesita, detiene todo, usa la herramienta, y le da el resultado a la IA para que pueda darte una respuesta correcta.
* 🛠️ **Las Herramientas (`src/agent/tools.ts`)**: Son las "manos" del bot. Aquí programamos habilidades extra (como saber la hora local).
* 🧠 **El Intelecto (`src/llm/generate.ts`)**: Aquí es donde OpenGravity se conecta a Internet para consultar a las mentes brillantes de Groq, Gemini u OpenRouter, traduciendo tus mensajes al formato que ellos entienden.
* 📚 **La Memoria (`src/db/`)**: El bot guarda cada mensaje en Firebase Firestore, como si fuera un archivero. Cuando te responde, primero lee los últimos mensajes de este archivero para tener contexto.
* 🎛️ **El Tablero de Control (`src/config.ts`)**: Revisa que todas las claves secretas y contraseñas estén correctamente configuradas antes de encender el bot.

---

## 🚀 ¿Cómo se instala y enciende?

Si quieres correr el bot en tu propia computadora, debes seguir estos pasos:

### 1. Requisitos Previos
* Tener instalado **Node.js** (el programa que permite correr el código JavaScript/TypeScript en tu computadora).
* Crearte un bot en Telegram usando el **BotFather** (él te dará un Token secreto).
* Tener una cuenta en Firebase (Google) para la base de datos de memoria y descargar tu archivo llave (`service-account.json`).
* Tener una clave (API Key) para el motor de Inteligencia Artificial que quieras usar (Grog, Gemini, etc.).

### 2. Configurar los Secretos
Debes crear un archivo llamado `.env` en la carpeta principal del proyecto. Este archivo contiene tus contraseñas y NUNCA debe compartirse. Debe verse más o menos así:

```env
TELEGRAM_BOT_TOKEN="tu_token_secreto_de_telegram"
TELEGRAM_ALLOWED_USER_IDS="tu_id_de_telegram"
ACTIVE_LLM="groq" # Opciones: "groq", "gemini", "openrouter"
GROQ_API_KEY="tu_clave_de_groq"
GEMINI_API_KEY="tu_clave_de_gemini"
GOOGLE_APPLICATION_CREDENTIALS="./service-account.json"
```

*Nota: Asegúrate de poner tu archivo `service-account.json` (descargado de Firebase) en la misma carpeta.*

### 3. Encender el Motor (Modo Desarrollo)

Si quieres probarlo localmente (con "Long Polling"), puedes correr el entorno de desarrollo. Ten en cuenta que en producción, usamos Firebase Cloud Functions.

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Compilar el código TypeScript:**
   ```bash
   npm run build
   ```

> [!NOTE]
> Para usar Telegram en modo **Webhook** con Firebase Functions, Telegram te pedirá que le digas en qué URL vive tu bot. Esto se hace enviando una petición GET a `https://api.telegram.org/bot<TU_TOKEN>/setWebhook?url=<URL_DE_FIREBASE>`.

### 4. Desplegar en la Nube (Firebase Cloud Functions)

OpenGravity está pre-configurado para subirse a la nube sin que tengas que gestionar servidores, cobrando cero (o casi cero) usando Firebase.

1. **Inicia sesión en Firebase:**
   ```bash
   npx firebase-tools login
   ```
2. **Selecciona tu proyecto:**
   ```bash
   npx firebase-tools use --add
   ```
3. **Sube tu bot:**
   ```bash
   npm run build
   npx firebase-tools deploy --only functions
   ```
Firebase te devolverá una URL. Deberás decirle a Telegram que envíe los mensajes a esa URL siguiendo el paso 3 (usando `setWebhook`). ¡Y listo, tu bot jamás se apagará!

---

## 🛑 Comandos Útiles en Telegram

* `/start` - Saluda al bot y reinicia la conversación actual.
* `/clear` - Borra manualmente toda la memoria (historial) que el bot tiene sobre ti, para que empiece completamente desde cero.