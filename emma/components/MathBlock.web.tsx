import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";

function buildHtml(latex: string, display: boolean, textColor: string, bgColor: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" crossorigin="anonymous">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" crossorigin="anonymous" onload="go()"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:${bgColor};overflow:hidden;width:100%}
body{padding:${display ? "8px 6px" : "1px 2px"};display:flex;align-items:center;justify-content:${display ? "center" : "flex-start"}}
.katex{color:${textColor};font-size:${display ? "1.2em" : "1.05em"};line-height:1.6}
.katex-display{margin:0;text-align:center}
</style>
</head>
<body><span id="m"></span>
<script>
function go(){
  try{katex.render(${JSON.stringify(latex)},document.getElementById("m"),{displayMode:${display},throwOnError:false,strict:false});}
  catch(e){document.getElementById("m").textContent=${JSON.stringify(latex)};}
  setTimeout(function(){
    var h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);
    window.parent.postMessage({type:"mathHeight",height:h},"*");
  },80);
}
</script>
</body>
</html>`;
}

interface MathBlockProps {
  latex: string;
  display?: boolean;
  textColor?: string;
  bgColor?: string;
}

export function MathBlock({
  latex,
  display = false,
  textColor = "#000",
  bgColor = "transparent",
}: MathBlockProps) {
  const [height, setHeight] = useState(display ? 72 : 30);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const html = buildHtml(latex, display, textColor, bgColor);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "mathHeight") {
        const h = e.data.height;
        if (typeof h === "number" && h > 4 && h < 600) setHeight(h + 4);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <View style={[{ height, width: "100%" }, display && { marginVertical: 4 }]}>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        style={{
          border: "none",
          width: "100%",
          height: "100%",
          background: bgColor,
          overflow: "hidden",
        }}
        sandbox="allow-scripts"
        scrolling="no"
      />
    </View>
  );
}
