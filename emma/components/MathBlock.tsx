import React, { useState } from "react";
import { Platform, View } from "react-native";
import { WebView } from "react-native-webview";

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
    try{window.ReactNativeWebView.postMessage(String(h));}catch(e){window.parent&&window.parent.postMessage(String(h),"*");}
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
  const html = buildHtml(latex, display, textColor, bgColor);

  return (
    <View
      style={[
        { height, width: "100%", overflow: "hidden" },
        display && { marginVertical: 4 },
      ]}
    >
      <WebView
        source={{ html }}
        style={{ flex: 1, backgroundColor: Platform.OS === "android" ? bgColor : "transparent" }}
        scrollEnabled={false}
        originWhitelist={["*"]}
        javaScriptEnabled
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onMessage={(e) => {
          const h = parseInt(e.nativeEvent.data, 10);
          if (!isNaN(h) && h > 4 && h < 600) setHeight(h + 4);
        }}
      />
    </View>
  );
}
