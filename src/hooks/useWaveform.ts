import { useState, useRef, useEffect } from 'react';
import sortBy from 'lodash/sortBy';
import { useThrottle } from '@uidotdev/usehooks';
import { waveformColorDark, waveformColorLight } from '../colors';

import { renderWaveformPng } from '../ffmpeg';
import { RenderableWaveform } from '../types';
import { FFprobeStream } from '../../ffprobe';


const maxWaveforms = 100;
// const maxWaveforms = 3; // testing

export default ({ darkMode, filePath, relevantTime, durationSafe, waveformEnabled, audioStream, ffmpegExtractWindow }: {
  darkMode: boolean, filePath: string | undefined, relevantTime: number, durationSafe: number, waveformEnabled: boolean, audioStream: FFprobeStream | undefined, ffmpegExtractWindow: number,
}) => {
  const creatingWaveformPromise = useRef<Promise<unknown>>();
  const [waveforms, setWaveforms] = useState<RenderableWaveform[]>([]);
  const waveformsRef = useRef<RenderableWaveform[]>();

  useEffect(() => {
    waveformsRef.current = waveforms;
  }, [waveforms]);

  const waveformColor = darkMode ? waveformColorDark : waveformColorLight;

  const timeThrottled = useThrottle(relevantTime, 1000);

  useEffect(() => {
    waveformsRef.current = [];
    setWaveforms([]);
  }, [filePath, audioStream, setWaveforms]);

  useEffect(() => {
    let aborted = false;

    (async () => {
      const waveformStartTime = Math.floor(timeThrottled / ffmpegExtractWindow) * ffmpegExtractWindow;

      const alreadyHaveWaveformAtTime = (waveformsRef.current || []).some((waveform) => waveform.from === waveformStartTime);
      const shouldRun = filePath && audioStream && timeThrottled != null && waveformEnabled && !alreadyHaveWaveformAtTime && !creatingWaveformPromise.current;
      if (!shouldRun) return;

      try {
        const safeExtractDuration = Math.min(waveformStartTime + ffmpegExtractWindow, durationSafe) - waveformStartTime;
        const promise = renderWaveformPng({ filePath, start: waveformStartTime, duration: safeExtractDuration, color: waveformColor, streamIndex: audioStream.index });
        creatingWaveformPromise.current = promise;
        const { buffer, ...newWaveform } = await promise;
        if (aborted) return;

        setWaveforms((currentWaveforms) => {
          const waveformsByCreatedAt = sortBy(currentWaveforms, 'createdAt');
          return [
            // cleanup old
            ...(currentWaveforms.length >= maxWaveforms ? waveformsByCreatedAt.slice(1) : waveformsByCreatedAt),
            {
              ...newWaveform,
              url: URL.createObjectURL(new Blob([buffer], { type: 'image/png' })),
            },
          ];
        });
      } catch (err) {
        console.error('Failed to render waveform', err);
      } finally {
        creatingWaveformPromise.current = undefined;
      }
    })();

    return () => {
      aborted = true;
    };
  }, [filePath, timeThrottled, waveformEnabled, audioStream, ffmpegExtractWindow, durationSafe, waveformColor, setWaveforms]);

  const lastWaveformsRef = useRef<RenderableWaveform[]>([]);
  useEffect(() => {
    const removedWaveforms = lastWaveformsRef.current.filter((wf) => !waveforms.includes(wf));
    // Cleanup old
    // if (removedWaveforms.length > 0) console.log('cleanup waveforms', removedWaveforms.length);
    removedWaveforms.forEach((waveform) => URL.revokeObjectURL(waveform.url));
    lastWaveformsRef.current = waveforms;
  }, [waveforms]);

  useEffect(() => () => setWaveforms([]), [setWaveforms]);

  return { waveforms };
};