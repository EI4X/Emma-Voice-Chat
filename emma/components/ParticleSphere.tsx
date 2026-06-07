import React, { useEffect, useRef, useState, useMemo } from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

const PARTICLE_COUNT = 160;

type SphereMode = "idle" | "listening" | "speaking";

function fibonacciSphere(n: number): Array<{ x: number; y: number; z: number }> {
  const pts: Array<{ x: number; y: number; z: number }> = [];
  const gr = (1 + Math.sqrt(5)) / 2;
  for (let i = 0; i < n; i++) {
    const theta = Math.acos(1 - (2 * (i + 0.5)) / n);
    const phi = (2 * Math.PI * i) / gr;
    pts.push({ x: Math.sin(theta) * Math.cos(phi), y: Math.sin(theta) * Math.sin(phi), z: Math.cos(theta) });
  }
  return pts;
}

function rotatePoints(pts: Array<{ x: number; y: number; z: number }>, ax: number, ay: number) {
  return pts.map((p) => {
    const cy = Math.cos(ay), sy = Math.sin(ay);
    const x1 = p.x * cy - p.z * sy;
    const z1 = p.x * sy + p.z * cy;
    const cx = Math.cos(ax), sx = Math.sin(ax);
    const y2 = p.y * cx - z1 * sx;
    const z2 = p.y * sx + z1 * cx;
    return { x: x1, y: y2, z: z2 };
  });
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const col = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * col).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

interface Props {
  amplitude?: number;
  size?: number;
  mode?: SphereMode;
  /** @deprecated use mode instead */
  isListening?: boolean;
}

export function ParticleSphere({ amplitude = 0, size = 260, mode, isListening }: Props) {
  // Backward compat
  const resolvedMode: SphereMode = mode ?? (isListening ? "listening" : "idle");

  const [rotY, setRotY] = useState(0);
  const [hue, setHue] = useState(200);
  const rotRef = useRef(0);
  const hueRef = useRef(200);
  const frameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  const basePoints = useMemo(() => fibonacciSphere(PARTICLE_COUNT), []);

  useEffect(() => {
    const animate = () => {
      const speed = resolvedMode === "idle" ? 0.002 : 0.004 + amplitude * 0.003;
      rotRef.current += speed;
      if (resolvedMode === "speaking") {
        hueRef.current = (hueRef.current + 0.8) % 360;
        setHue(hueRef.current);
      }
      setRotY(rotRef.current);
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); };
  }, [resolvedMode, amplitude]);

  const center = size / 2;
  const baseRadius = size * 0.38;
  const pulseScale = resolvedMode === "idle" ? 1 : 1 + amplitude * 0.22;
  const radius = baseRadius * pulseScale;

  const rotated = rotatePoints(basePoints, 0.3, rotY);
  const projected = rotated.map((p, i) => {
    const perspective = (p.z + 2.2) / 3.2;
    const x = center + p.x * radius * perspective;
    const y = center + p.y * radius * perspective;
    const depth = (p.z + 1) / 2;
    const opacity = resolvedMode === "idle"
      ? depth * 0.4 + 0.1
      : depth * 0.72 + 0.15;
    const r = perspective * 1.6 + (resolvedMode !== "idle" ? amplitude * 0.9 : 0);
    return { x, y, opacity, r, z: p.z, depth, i };
  });
  projected.sort((a, b) => a.z - b.z);

  // Glow params
  const glowOpacity = resolvedMode === "idle" ? 0.04
    : resolvedMode === "listening" ? 0.10 + amplitude * 0.18
    : 0.20 + amplitude * 0.15;
  const glowRadius = radius * (resolvedMode === "idle" ? 1.0 : 1.12 + amplitude * 0.06);

  // Glow color
  const glowColor = resolvedMode === "speaking" ? hslToHex(hue, 1, 0.6) : "#ffffff";
  const glowColor2 = resolvedMode === "speaking" ? hslToHex((hue + 60) % 360, 1, 0.5) : "#aaaaaa";

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="outerGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={glowColor} stopOpacity={glowOpacity} />
            <Stop offset="55%" stopColor={glowColor2} stopOpacity={glowOpacity * 0.3} />
            <Stop offset="100%" stopColor="#0A0A0A" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="innerGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={glowColor} stopOpacity="0.05" />
            <Stop offset="100%" stopColor={glowColor} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <Circle cx={center} cy={center} r={glowRadius * 1.15} fill="url(#outerGlow)" />
        <Circle cx={center} cy={center} r={radius * 0.65} fill="url(#innerGlow)" />

        {projected.map((p) => {
          let color: string;
          if (resolvedMode === "idle") {
            const g = Math.round(45 + p.depth * 60).toString(16).padStart(2, "0");
            color = `#${g}${g}${g}`;
          } else if (resolvedMode === "listening") {
            const brightness = Math.round(140 + p.depth * 80 + amplitude * 35);
            const b = Math.min(255, brightness).toString(16).padStart(2, "0");
            color = `#${b}${b}${b}`;
          } else {
            // Speaking — vibrant cycling hue
            const h2 = (hue + p.depth * 60) % 360;
            const sat = 0.8 + amplitude * 0.15;
            const lit = 0.45 + p.depth * 0.25 + amplitude * 0.1;
            color = hslToHex(h2, Math.min(1, sat), Math.min(0.9, lit));
          }

          return (
            <Circle
              key={p.i}
              cx={p.x}
              cy={p.y}
              r={Math.max(p.r, 0.5)}
              fill={color}
              opacity={p.opacity}
            />
          );
        })}
      </Svg>
    </View>
  );
}
