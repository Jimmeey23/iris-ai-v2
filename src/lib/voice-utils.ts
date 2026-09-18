/**
 * PHASE 3: Voice I/O Enhancements
 * Web Speech API for enhanced voice input and text-to-speech for IRIS responses
 */

/**
 * Text-to-Speech: Speak IRIS messages to user
 * Uses browser Web Speech API (SpeechSynthesis)
 */
export function speak(text: string, options?: { rate?: number; pitch?: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!("speechSynthesis" in window)) {
      reject(new Error("Speech Synthesis not supported in this browser"));
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options?.rate || 1;
    utterance.pitch = options?.pitch || 1;

    utterance.onend = () => resolve();
    utterance.onerror = (event) =>
      reject(new Error(`Speech synthesis error: ${event.error}`));

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Stop ongoing speech
 */
export function stopSpeaking(): void {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Speech Recognition: Enhanced voice input with transcript confidence
 * Uses browser Speech Recognition API (webkit/moz/ms prefixed)
 */
type SpeechRecognitionEvent = Event & {
  results: SpeechRecognitionResultList;
  resultIndex: number;
};

type SpeechRecognitionErrorEvent = Event & {
  error: string;
};

interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

export async function captureVoiceInput(options?: {
  language?: string;
  continuous?: boolean;
  timeout?: number;
}): Promise<SpeechRecognitionResult[]> {
  return new Promise((resolve, reject) => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      reject(new Error("Speech Recognition not supported in this browser"));
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.language = options?.language || "en-IN";
    recognition.continuous = options?.continuous || false;
    recognition.interimResults = true;

    const results: SpeechRecognitionResult[] = [];
    const timeoutId = options?.timeout
      ? setTimeout(() => {
          recognition.abort();
          resolve(results);
        }, options.timeout)
      : null;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        const confidence = event.results[i][0].confidence;
        const isFinal = event.results[i].isFinal;

        // Remove duplicates and add to results
        const existing = results.find((r) => r.transcript === transcript);
        if (!existing) {
          results.push({ transcript, confidence, isFinal });
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(new Error(`Speech recognition error: ${event.error}`));
    };

    recognition.onend = () => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve(results);
    };

    recognition.start();
  });
}

/**
 * Voice-only ticket creation: Listen to entire user input without text interface
 * Returns transcribed text or null if cancelled
 */
export async function recordVoiceOnly(): Promise<string | null> {
  try {
    const results = await captureVoiceInput({
      language: "en-IN",
      continuous: true,
      timeout: 30000, // 30 second max
    });

    if (results.length === 0) return null;

    // Use the transcript with highest confidence
    const best = results.reduce((prev, current) =>
      current.confidence > prev.confidence ? current : prev
    );

    return best.transcript;
  } catch {
    return null;
  }
}

/**
 * Streaming voice input with real-time transcription display
 * Yields interim results as the user speaks
 */
export async function* streamVoiceInput(options?: {
  language?: string;
  onInterim?: (text: string) => void;
}): AsyncGenerator<string> {
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    throw new Error("Speech Recognition not supported");
  }

  const recognition = new SpeechRecognition();
  recognition.language = options?.language || "en-IN";
  recognition.continuous = true;
  recognition.interimResults = true;

  let finalTranscript = "";

  yield new Promise<string>((resolve, reject) => {
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
        } else {
          interimTranscript += transcript;
        }
      }

      if (interimTranscript) {
        options?.onInterim?.(interimTranscript);
      }

      if (finalTranscript) {
        resolve(finalTranscript.trim());
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      reject(new Error(`Speech error: ${event.error}`));
    };

    recognition.start();
  });
}

/**
 * Check if browser supports voice features
 */
export function voiceSupported(): {
  speechSynthesis: boolean;
  speechRecognition: boolean;
} {
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  return {
    speechSynthesis: "speechSynthesis" in window,
    speechRecognition: !!SpeechRecognition,
  };
}
