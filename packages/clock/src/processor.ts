export const PROCESSOR = `"use strict";(()=>{var a=class extends AudioWorkletProcessor{r;bpm;i;p;constructor(){super(),this.r=!0,this.bpm=120,this.i=this.bpm/60/sampleRate,this.p=0,this.port.onmessage=s=>{switch(s.data.type){case"DISCONNECT":this.r=!1;break}}}process(s,e,r){r.bpm[0]!==this.bpm&&(this.bpm=r.bpm[0],this.i=this.bpm/60/sampleRate);let t=this.p;for(let i=0;i<e[0][0].length;i++)e[0][0][i]=t,t+=this.i,t>=1&&(t-=1);return this.p=t,this.r}static get parameterDescriptors(){return[["bpm",120,30,300]].map(([s,e,r,t])=>({name:s,defaultValue:e,minValue:r,maxValue:t,automationRate:"k-rate"}))}};registerProcessor("ClockWorkletProcessor",a);})();`;
