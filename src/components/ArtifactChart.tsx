import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import * as echarts from 'echarts';

interface ArtifactChartProps {
  option: echarts.EChartsOption;
  height?: number | string;
}

export default function ArtifactChart({ option, height = 400 }: ArtifactChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Initialize chart if it doesn't exist
    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
    }

    // Set options safely
    try {
      chartInstanceRef.current.setOption(option, true);
    } catch (e) {
      console.error("ECharts failed to set option:", e);
    }

    const handleResize = () => {
      chartInstanceRef.current?.resize();
    };

    window.addEventListener('resize', handleResize);
    
    // Create a ResizeObserver to observe the container itself (since the side panel might resize without the window resizing)
    const resizeObserver = new ResizeObserver(() => {
      chartInstanceRef.current?.resize();
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, [option]);

  return (
    <Box 
      sx={{ 
        width: '100%', 
        height, 
        mt: 2, 
        mb: 2, 
        bgcolor: 'background.paper',
        borderRadius: 2,
        overflow: 'hidden'
      }}
    >
      <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
    </Box>
  );
}
