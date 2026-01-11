
export const createTimerWorker = () => {
  const workerCode = `
    let timerId = null;
    self.onmessage = function(e) {
      if (e.data.type === 'START') {
        if (timerId) clearInterval(timerId);
        timerId = setInterval(() => {
          self.postMessage({ type: 'TICK' });
        }, 1000);
      } else if (e.data.type === 'STOP') {
        if (timerId) clearInterval(timerId);
        timerId = null;
      }
    };
  `;
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  return new Worker(URL.createObjectURL(blob));
};
