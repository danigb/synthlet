export const PROCESSOR = `"use strict";(()=>{function g(){let i=60,o=0,n=1,t=[0],e=0,s=1,u=!1,f=i;return function(h,a,y,m,x){return i=y,n=x,o!==m&&(o=m,t=D(m),s=t.length,e=e%s),h===1?u||(u=!0,f=M(a)):u=!1,440*Math.pow(2,(f-69)/12)};function M(r){switch(r){case 0:default:return b()}}function b(){let r=Math.floor(Math.random()*(n-1)),h=t[Math.floor(Math.random()*s)];return i+h+r*12}}function D(i){let o=i.toString(2),n=[];for(let t=0;t<o.length;t++)o[t]==="1"&&n.push(t);return n}var d=class extends AudioWorkletProcessor{r;a;constructor(){super(),this.r=!0,this.a=g(),this.port.onmessage=o=>{switch(o.data.type){case"DISPOSE":this.r=!1;break}}}process(o,n,t){let e=this.a(t.trigger[0],t.type[0],t.baseNote[0],t.scale[0],t.octaves[0]),s=n[0][0];return s&&s.fill(e),this.r}static get parameterDescriptors(){return[["trigger",0,0,1],["type",0,0,1],["baseNote",60,0,200],["scale",1,1,2047],["octaves",1,1,10]].map(([o,n,t,e])=>({name:o,defaultValue:n,minValue:t,maxValue:e,automationRate:"k-rate"}))}};registerProcessor("ArpProcessor",d);})();`;