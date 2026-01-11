
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { TimerMode, TaskStep, ChainPreset } from './types';
import { createTimerWorker } from './services/workerFactory';
import { playNotificationSound } from './services/audioService';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Plus, 
  Trash2, 
  Save, 
  Clock, 
  Bell, 
  ChevronRight, 
  FastForward,
  Settings2,
  LayoutGrid,
  History,
  Edit2
} from 'lucide-react';

const App: React.FC = () => {
  // --- 1. 计时器内核状态 (Global Logic Kernel) ---
  const [isRunning, setIsRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [activeTimerMode, setActiveTimerMode] = useState<TimerMode | null>(null);
  const [activeSequence, setActiveSequence] = useState<TaskStep[]>([]);

  // --- 2. 视图与配置状态 (UI State Isolation) ---
  const [viewMode, setViewMode] = useState<TimerMode>(TimerMode.SINGLE);
  const [singleDuration, setSingleDuration] = useState(25);
  const [chainSteps, setChainSteps] = useState<TaskStep[]>([
    { id: '1', label: 'Focus', duration: 25 },
    { id: '2', label: 'Short Break', duration: 5 }
  ]);
  const [presets, setPresets] = useState<ChainPreset[]>([]);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');

  // --- Refs ---
  const workerRef = useRef<Worker | null>(null);

  // --- 初始化 ---
  useEffect(() => {
    workerRef.current = createTimerWorker();
    workerRef.current.onmessage = (e) => {
      if (e.data.type === 'TICK') {
        setTimeLeft((prev) => prev - 1);
      }
    };

    const saved = localStorage.getItem('focus_presets');
    if (saved) setPresets(JSON.parse(saved));

    if ('Notification' in window) {
      setNotifPermission(Notification.permission);
    }

    return () => workerRef.current?.terminate();
  }, []);

  // --- 动态标题同步 ---
  useEffect(() => {
    if (isRunning && activeTimerMode) {
      const mins = Math.floor(timeLeft / 60);
      const secs = timeLeft % 60;
      const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      const taskName = activeTimerMode === TimerMode.SINGLE ? 'Focus' : activeSequence[activeStepIndex]?.label;
      document.title = `${timeStr} ${taskName}`;
    } else {
      document.title = 'FocusChain';
    }
  }, [timeLeft, isRunning, activeTimerMode, activeSequence, activeStepIndex]);

  // --- 核心计时逻辑控制 ---
  const startTimer = useCallback((mode: TimerMode) => {
    const sequence = mode === TimerMode.SINGLE 
      ? [{ id: 'single', label: 'Single Session', duration: singleDuration }]
      : [...chainSteps];
    
    setActiveSequence(sequence);
    setActiveTimerMode(mode);
    setActiveStepIndex(0);
    setTimeLeft(sequence[0].duration * 60);
    setIsRunning(true);
    workerRef.current?.postMessage({ type: 'START' });
  }, [singleDuration, chainSteps]);

  const toggleTimer = useCallback(() => {
    if (isRunning) {
      workerRef.current?.postMessage({ type: 'STOP' });
      setIsRunning(false);
    } else {
      // 如果当前是空闲状态或模式不匹配，则根据当前 ViewMode 重新开始
      if (!activeTimerMode || activeTimerMode !== viewMode || timeLeft <= 0) {
        startTimer(viewMode);
      } else {
        workerRef.current?.postMessage({ type: 'START' });
        setIsRunning(true);
      }
    }
  }, [isRunning, activeTimerMode, viewMode, timeLeft, startTimer]);

  const resetTimer = useCallback(() => {
    workerRef.current?.postMessage({ type: 'STOP' });
    setIsRunning(false);
    setActiveTimerMode(null);
    // 复位到当前视图模式的初始时间
    const resetDuration = viewMode === TimerMode.SINGLE ? singleDuration : chainSteps[0].duration;
    setTimeLeft(resetDuration * 60);
  }, [viewMode, singleDuration, chainSteps]);

  const skipStep = useCallback(() => {
    if (activeTimerMode === TimerMode.CHAIN && activeStepIndex < activeSequence.length - 1) {
      const nextIndex = activeStepIndex + 1;
      setActiveStepIndex(nextIndex);
      setTimeLeft(activeSequence[nextIndex].duration * 60);
    }
  }, [activeTimerMode, activeStepIndex, activeSequence]);

  // --- 自动化：步进与复位 ---
  useEffect(() => {
    if (timeLeft <= 0 && isRunning) {
      playNotificationSound();
      const currentLabel = activeSequence[activeStepIndex]?.label || 'Task';
      if (notifPermission === 'granted') {
        new Notification('FocusChain', { body: `${currentLabel} finished.` });
      }

      // 如果是 Chain 且没跑完
      if (activeTimerMode === TimerMode.CHAIN && activeStepIndex < activeSequence.length - 1) {
        const nextIndex = activeStepIndex + 1;
        setActiveStepIndex(nextIndex);
        setTimeLeft(activeSequence[nextIndex].duration * 60);
      } else {
        // 彻底结束：自动复位交互
        workerRef.current?.postMessage({ type: 'STOP' });
        setIsRunning(false);
        const finishMode = activeTimerMode;
        setActiveTimerMode(null);
        
        // 自动复位时间到初始值，方便再次开始
        const initialDur = finishMode === TimerMode.SINGLE ? singleDuration : chainSteps[0].duration;
        setTimeLeft(initialDur * 60);
      }
    }
  }, [timeLeft, isRunning, activeStepIndex, activeSequence, activeTimerMode, notifPermission, singleDuration, chainSteps]);

  // --- 视图显示逻辑 ---
  // 判断当前用户正在看的标签页是否正在计时
  const isViewingActive = viewMode === activeTimerMode;
  
  // 决定大屏幕上显示的时间：如果是活跃视图显示倒计时，否则显示该模式的配置时间
  const displayTime = useMemo(() => {
    if (isViewingActive) return timeLeft;
    return (viewMode === TimerMode.SINGLE ? singleDuration : chainSteps[0].duration) * 60;
  }, [isViewingActive, timeLeft, viewMode, singleDuration, chainSteps]);

  const progressPercent = useMemo(() => {
    if (!isViewingActive || !isRunning) return 0;
    const total = activeSequence[activeStepIndex].duration * 60;
    return ((total - timeLeft) / total) * 100;
  }, [isViewingActive, isRunning, activeSequence, activeStepIndex, timeLeft]);

  // --- 预设与管理功能 ---
  const savePreset = () => {
    const name = prompt('Enter preset name:');
    if (name) {
      const newPreset: ChainPreset = { id: Date.now().toString(), name, steps: [...chainSteps] };
      const updated = [...presets, newPreset];
      setPresets(updated);
      localStorage.setItem('focus_presets', JSON.stringify(updated));
    }
  };

  const renamePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const preset = presets.find(p => p.id === id);
    if (!preset) return;
    const newName = prompt('Rename preset to:', preset.name);
    if (newName && newName !== preset.name) {
      const updated = presets.map(p => p.id === id ? { ...p, name: newName } : p);
      setPresets(updated);
      localStorage.setItem('focus_presets', JSON.stringify(updated));
    }
  };

  const deletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    localStorage.setItem('focus_presets', JSON.stringify(updated));
  };

  const loadPreset = (p: ChainPreset) => {
    setChainSteps(p.steps);
    setViewMode(TimerMode.CHAIN);
    // 加载时不自动开始，只是复位视图
    resetTimer();
  };

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#F5F5F7] dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-[#F5F5F7] transition-colors overflow-hidden">
      
      {/* 顶部通知权限提醒 */}
      {notifPermission === 'default' && (
        <div className="absolute top-4 glass rounded-full px-4 py-2 flex items-center gap-3 shadow-lg z-50 animate-bounce">
          <Bell className="text-blue-500" size={14} />
          <span className="text-[11px] font-semibold">Enable desktop notifications</span>
          <button onClick={() => Notification.requestPermission().then(setNotifPermission)} className="bg-blue-500 text-white text-[10px] px-3 py-1 rounded-full font-bold">Allow</button>
        </div>
      )}

      {/* 主布局容器 */}
      <div className="w-full max-w-5xl h-[90vh] max-h-[750px] grid grid-cols-12 gap-6 p-4">
        
        {/* 左侧：核心计时区 (7 cols) */}
        <div className="col-span-12 lg:col-span-7 flex flex-col h-full">
          <div className="flex-1 glass rounded-[50px] shadow-2xl flex flex-col items-center justify-center relative overflow-hidden p-8 border border-white/40 dark:border-white/5">
            
            {/* 进度条底座 */}
            <div className="absolute bottom-0 left-0 w-full h-1.5 bg-black/5 dark:bg-white/5">
              <div 
                className="h-full bg-blue-500 transition-all duration-1000 ease-linear shadow-[0_0_15px_rgba(59,130,246,0.5)]" 
                style={{ width: `${progressPercent}%` }} 
              />
            </div>

            {/* 模式选择切换器 */}
            <div className="flex gap-1 mb-8 bg-black/5 dark:bg-white/10 p-1 rounded-full">
              <button 
                onClick={() => setViewMode(TimerMode.SINGLE)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold transition-all ${viewMode === TimerMode.SINGLE ? 'bg-white dark:bg-zinc-700 shadow-md scale-105' : 'opacity-40 hover:opacity-100'}`}
              >
                <Clock size={14} /> Single
              </button>
              <button 
                onClick={() => setViewMode(TimerMode.CHAIN)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold transition-all ${viewMode === TimerMode.CHAIN ? 'bg-white dark:bg-zinc-700 shadow-md scale-105' : 'opacity-40 hover:opacity-100'}`}
              >
                <LayoutGrid size={14} /> Chain
              </button>
            </div>

            {/* 当前任务状态 */}
            <div className="flex flex-col items-center gap-1 mb-4">
              <div className="text-blue-500 font-black tracking-[0.2em] uppercase text-[10px] flex items-center gap-2">
                {isViewingActive && isRunning ? <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> : <span className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />}
                {isViewingActive ? (activeTimerMode === TimerMode.SINGLE ? 'Focusing' : activeSequence[activeStepIndex]?.label) : 'Ready'}
              </div>
              {!isViewingActive && activeTimerMode && (
                <div className="text-[9px] text-orange-500 font-bold uppercase animate-pulse">
                  Timer running in {activeTimerMode} mode
                </div>
              )}
            </div>

            {/* 巨大时间显示 */}
            <div className={`text-[120px] md:text-[160px] font-[100] tracking-tighter leading-none select-none transition-all duration-500 ${isViewingActive && isRunning ? 'scale-110' : 'scale-100 opacity-90'}`}>
              {Math.floor(displayTime / 60)}<span className="opacity-20">:</span>{(displayTime % 60).toString().padStart(2, '0')}
            </div>

            {/* 操作控制台 */}
            <div className="flex items-center gap-8 mt-10">
              <button onClick={resetTimer} className="w-12 h-12 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-all active:scale-90">
                <RotateCcw size={20} className="text-zinc-500" />
              </button>
              
              <button 
                onClick={toggleTimer}
                className={`w-24 h-24 rounded-full flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 shadow-2xl ${isRunning && isViewingActive ? 'bg-orange-500 text-white' : 'bg-blue-500 text-white shadow-blue-500/30'}`}
              >
                {isRunning && isViewingActive ? <Pause size={40} fill="currentColor" /> : <Play size={40} className="ml-1.5" fill="currentColor" />}
              </button>

              <div className="w-12 h-12 flex items-center justify-center">
                {isViewingActive && activeTimerMode === TimerMode.CHAIN && activeStepIndex < activeSequence.length - 1 && (
                  <button onClick={skipStep} className="w-12 h-12 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-black/10 transition-all active:scale-90">
                    <FastForward size={20} className="text-zinc-500" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：等高对齐配置区 (5 cols) */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-6 h-full">
          
          {/* Builder Section (1/2 Height) */}
          <div className="flex-1 glass rounded-[35px] p-6 shadow-xl flex flex-col min-h-0 border border-white/20">
            <div className="flex items-center justify-between mb-4 border-b border-black/5 dark:border-white/5 pb-3">
              <h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 opacity-60">
                <Settings2 size={14} />
                {viewMode === TimerMode.SINGLE ? 'Single Settings' : 'Chain Builder'}
              </h2>
              {viewMode === TimerMode.CHAIN && (
                <div className="flex gap-1">
                   <button onClick={savePreset} className="p-2 hover:bg-blue-500/10 text-blue-500 rounded-full transition-all" title="Save Preset">
                    <Save size={16} />
                  </button>
                  <button onClick={() => setChainSteps([...chainSteps, { id: Date.now().toString(), label: 'New Task', duration: 25 }])} className="p-2 hover:bg-green-500/10 text-green-600 rounded-full transition-all">
                    <Plus size={16} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
              {viewMode === TimerMode.SINGLE ? (
                <div className="space-y-6 py-2">
                  <div className="bg-black/5 dark:bg-white/5 rounded-3xl p-6">
                    <span className="text-[10px] font-black uppercase text-zinc-400 block mb-4">Focus Duration</span>
                    <div className="flex items-center gap-6">
                       <input 
                        type="range" min="1" max="120"
                        value={singleDuration}
                        onChange={(e) => {
                          const v = parseInt(e.target.value);
                          setSingleDuration(v);
                          if (!isRunning || activeTimerMode !== TimerMode.SINGLE) setTimeLeft(v * 60);
                        }}
                        className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                      <span className="text-2xl font-[200] w-12 text-center">{singleDuration}m</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 pb-4">
                  {chainSteps.map((step, idx) => (
                    <div key={step.id} className="flex items-center gap-3 p-3 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-black/[0.08] transition-all group">
                      <div className="text-[10px] font-black w-4 opacity-20">{idx + 1}</div>
                      <input 
                        type="text" 
                        value={step.label}
                        onChange={(e) => setChainSteps(chainSteps.map(s => s.id === step.id ? { ...s, label: e.target.value } : s))}
                        className="flex-1 bg-transparent text-xs font-bold outline-none"
                      />
                      <input 
                        type="number" 
                        value={step.duration}
                        onChange={(e) => setChainSteps(chainSteps.map(s => s.id === step.id ? { ...s, duration: parseInt(e.target.value) || 1 } : s))}
                        className="w-12 bg-white/50 dark:bg-black/50 rounded-lg px-1.5 py-1 text-[11px] outline-none text-right font-bold"
                      />
                      <button onClick={() => chainSteps.length > 1 && setChainSteps(chainSteps.filter(s => s.id !== step.id))} className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-red-500 transition-all">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Preset Library (1/2 Height) */}
          <div className="flex-1 glass rounded-[35px] p-6 shadow-xl flex flex-col min-h-0 border border-white/20">
            <h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 opacity-60 mb-4 border-b border-black/5 dark:border-white/5 pb-3">
              <History size={14} />
              Preset Library
            </h2>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
              {presets.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-20 italic text-[11px] py-4 text-center px-4">
                  Combine tasks and save <br/> presets for quick access
                </div>
              ) : (
                presets.map((p) => (
                  <div 
                    key={p.id}
                    onClick={() => loadPreset(p)}
                    className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-black/[0.08] transition-all group cursor-pointer border border-transparent hover:border-blue-500/20"
                  >
                    <div className="flex-1 truncate pr-2">
                      <div className="text-xs font-bold truncate group-hover:text-blue-500 transition-colors">{p.name}</div>
                      <div className="text-[9px] font-black uppercase tracking-tight opacity-40">{p.steps.length} Tasks • {p.steps.reduce((acc, s) => acc + s.duration, 0)}m</div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button onClick={(e) => renamePreset(p.id, e)} className="p-2 opacity-0 group-hover:opacity-100 hover:bg-zinc-500/10 rounded-full text-zinc-400 hover:text-blue-500 transition-all">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={(e) => deletePreset(p.id, e)} className="p-2 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 rounded-full text-zinc-400 hover:text-red-500 transition-all">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

      <footer className="mt-4 opacity-20 text-[9px] font-black uppercase tracking-[0.3em]">
        macOS Dynamic Focus System
      </footer>
    </div>
  );
};

export default App;
