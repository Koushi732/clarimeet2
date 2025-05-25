import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface AudioVisualizerProps {
  audioLevel: number;
  isRecording: boolean;
  barCount?: number;
  height?: number;
  className?: string;
}

const AudioVisualizer = ({
  audioLevel,
  isRecording,
  barCount = 20,
  height = 60,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const audioLevelsRef = useRef<number[]>(Array(barCount).fill(0.05));
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas dimensions
    canvas.width = canvas.clientWidth;
    canvas.height = height;
    
    // Update audio levels array
    if (isRecording) {
      // Add new audio level (with some randomness to make it look more natural)
      const randomFactor = 0.3;
      const newLevel = audioLevel * (1 + (Math.random() * randomFactor - randomFactor / 2));
      audioLevelsRef.current.push(Math.max(0.05, Math.min(1, newLevel)));
      
      // Remove oldest level
      if (audioLevelsRef.current.length > barCount) {
        audioLevelsRef.current.shift();
      }
    }
    
    // Draw visualization
    const draw = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Calculate bar width and spacing
      const spacing = 2;
      const barWidth = (canvas.width - spacing * (barCount - 1)) / barCount;
      
      // Draw each bar
      audioLevelsRef.current.forEach((level, i) => {
        const x = i * (barWidth + spacing);
        const barHeight = level * canvas.height;
        
        // Create gradient
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
        
        if (isRecording) {
          gradient.addColorStop(0, 'rgba(14, 165, 233, 0.8)'); // primary-500
          gradient.addColorStop(1, 'rgba(56, 189, 248, 0.5)'); // primary-400
        } else {
          gradient.addColorStop(0, 'rgba(156, 163, 175, 0.5)'); // gray-400
          gradient.addColorStop(1, 'rgba(209, 213, 219, 0.3)'); // gray-300
        }
        
        ctx.fillStyle = gradient;
        
        // Draw rounded rectangle
        const radius = Math.min(barWidth / 2, 4);
        ctx.beginPath();
        ctx.moveTo(x + radius, canvas.height);
        ctx.lineTo(x + barWidth - radius, canvas.height);
        ctx.lineTo(x + barWidth - radius, canvas.height - barHeight + radius);
        ctx.quadraticCurveTo(x + barWidth, canvas.height - barHeight, x + barWidth - radius, canvas.height - barHeight);
        ctx.lineTo(x + radius, canvas.height - barHeight);
        ctx.quadraticCurveTo(x, canvas.height - barHeight, x + radius, canvas.height - barHeight + radius);
        ctx.lineTo(x + radius, canvas.height);
        ctx.fill();
      });
      
      // Animate
      animationRef.current = requestAnimationFrame(draw);
    };
    
    // Start animation
    draw();
    
    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audioLevel, isRecording, barCount, height]);
  
  return (
    <motion.div
      className={`w-full ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <canvas 
        ref={canvasRef} 
        className="w-full h-full"
        style={{ height }}
      />
    </motion.div>
  );
};

export default AudioVisualizer;
