export const PROCESSOR = `"use strict";(()=>{function u(t){switch(t){case 0:return i;case 1:return a;case 2:return b;case 3:return h;default:return i}}function i(t){return t}function a(t){return Math.pow(10,t/20)}function b(t){return 20*Math.log10(t)}function h(t,n,r){return n+t*(r-n)}var s=class extends AudioWorkletProcessor{r;t;c;constructor(){super(),this.r=!0,this.t=0,this.c=u(this.t),this.port.onmessage=n=>{switch(n.data.type){case"DISPOSE":this.r=!1;break}}}process(n,r,e){this.t!==e.type[0]&&(this.t=e.type[0],this.c=u(this.t));let o=n[0][0],c=(o?o[0]:0)+e.input[0]+e.offset[0];return r[0][0].fill(this.c(c,e.min[0],e.max[0])),this.r}static get parameterDescriptors(){return[["type",0,0,10],["input",0,0,1e6],["offset",0,0,1e6],["min",0,0,1e6],["max",1,0,1e6]].map(([n,r,e,o])=>({name:n,defaultValue:r,minValue:e,maxValue:o,automationRate:"k-rate"}))}};registerProcessor("ParamProcessor",s);})();`;
