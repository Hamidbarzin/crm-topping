import { useEffect, useRef } from "react";
import Chart, { type ChartConfiguration } from "chart.js/auto";

interface ChartCanvasProps {
  config: ChartConfiguration;
  height: number;
  ariaLabel?: string;
}

export default function ChartCanvas({ config, height, ariaLabel }: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    chartRef.current = new Chart(ctx, config);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [config]);

  return (
    <div className="relative w-full" style={{ height }}>
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
    </div>
  );
}
