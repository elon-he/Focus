
export const playNotificationSound = () => {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  const playPulse = (freq: number, time: number, duration: number) => {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, time);
    
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(0.2, time + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);

    oscillator.start(time);
    oscillator.stop(time + duration);
  };

  const now = audioCtx.currentTime;
  // Dual pulse for a crisp "Ping" feel
  playPulse(1046.50, now, 0.4); // C6
  playPulse(1318.51, now + 0.05, 0.3); // E6
};
