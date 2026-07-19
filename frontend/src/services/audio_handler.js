// Audio capture downsampler and audio playback queue for Gemini Multimodal Live API

export class GeminiAudioSession {
  constructor(sessionId, apiBaseUrl) {
    this.sessionId = sessionId;
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = apiBaseUrl.replace(/^https?:\/\//, '');
    this.wsUrl = `${wsProto}//${host}/api/v1/interviews/ws/${sessionId}/voice`;
    
    this.ws = null;
    this.audioCtx = null;
    this.micStream = null;
    this.processorNode = null;
    this.sourceNode = null;
    this.nextPlayTime = 0;
    this.isPlaying = false;
    this.onTranscript = null;
    this.onError = null;
    this.onClose = null;
  }

  async start() {
    this.isPlaying = true;
    this.nextPlayTime = 0;

    // 1. Establish WebSocket connection to backend voice proxy
    this.ws = new WebSocket(this.wsUrl);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      console.log('Voice socket connected!');
    };

    this.ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        // Incoming Gemini Live 24kHz audio bytes
        this.playAudioChunk(e.data);
      } else {
        // Incoming text transcripts
        try {
          const event = JSON.parse(e.data);
          if (event.type === 'transcript' && this.onTranscript) {
            this.onTranscript(event.text);
          }
          if (event.type === 'error' && this.onError) {
            this.onError(event.message);
          }
        } catch (err) {
          console.error('Error parsing voice socket event:', err);
        }
      }
    };

    this.ws.onerror = (err) => {
      console.error('Voice socket error:', err);
      if (this.onError) this.onError('WebSocket connection error.');
    };

    this.ws.onclose = () => {
      console.log('Voice socket closed.');
      if (this.onClose) this.onClose();
      this.stop();
    };

    // 2. Initialize Audio Context
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioContextClass();
    
    // 3. Request microphone permission and access stream
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      this.sourceNode = this.audioCtx.createMediaStreamSource(this.micStream);
      
      // Capture 4096 samples, downsample from native rate to 16kHz
      this.processorNode = this.audioCtx.createScriptProcessor(4096, 1, 1);
      
      const sampleRate = this.audioCtx.sampleRate;
      
      this.processorNode.onaudioprocess = (e) => {
        if (!this.isPlaying || this.ws.readyState !== WebSocket.OPEN) return;
        
        const float32Data = e.inputBuffer.getChannelData(0);
        
        // Downsample input to 16000Hz PCM
        const downsampledBuffer = this.downsampleBuffer(float32Data, sampleRate, 16000);
        
        // Convert to 16-bit signed PCM
        const pcmBuffer = this.convertTo16BitPCM(downsampledBuffer);
        
        // Send raw binary PCM frame over WebSocket
        this.ws.send(pcmBuffer);
      };
      
      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioCtx.destination);
      
    } catch (err) {
      console.error('Microphone access failed:', err);
      if (this.onError) {
        this.onError('Microphone access required for Spoken Interview Mode.');
      }
      this.stop();
    }
  }

  stop() {
    this.isPlaying = false;
    
    // Stop microphone stream tracks
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }
    
    // Disconnect audio nodes
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    
    // Close Audio Context
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
    
    // Close WebSocket
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  // Downsample utility
  downsampleBuffer(buffer, fromRate, toRate) {
    if (fromRate === toRate) {
      return buffer;
    }
    const sampleRateRatio = fromRate / toRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  // Float32 to 16-bit PCM conversion
  convertTo16BitPCM(float32Buffer) {
    const buffer = new ArrayBuffer(float32Buffer.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Buffer.length; i++) {
      // Clamp values between -1.0 and 1.0
      const s = Math.max(-1, Math.min(1, float32Buffer[i]));
      // Convert to 16-bit signed integer
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
  }

  // Audio queue play scheduling
  playAudioChunk(arrayBuffer) {
    if (!this.audioCtx || !this.isPlaying) return;
    
    // Convert 16-bit signed PCM buffer to Float32 array
    const int16View = new Int16Array(arrayBuffer);
    const float32Buffer = new Float32Array(int16View.length);
    for (let i = 0; i < int16View.length; i++) {
      float32Buffer[i] = int16View[i] / 32768.0;
    }
    
    // Create Audio Buffer at 24000Hz (sample rate returned by Gemini Live)
    const audioBuffer = this.audioCtx.createBuffer(1, float32Buffer.length, 24000);
    audioBuffer.copyToChannel(float32Buffer, 0);
    
    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioCtx.destination);
    
    // Queue scheduling logic to avoid pops/gaps
    const currentTime = this.audioCtx.currentTime;
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime;
    }
    
    source.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;
  }
}
