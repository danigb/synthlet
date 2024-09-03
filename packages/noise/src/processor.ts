export const PROCESSOR = `"use strict";(()=>{function A(r,t){switch(t){case 0:return N;case 1:return R();case 10:return M(r);case 11:return P();default:return console.warn("Unknown noise type: "+t),N}}function N(r){for(let t=0;t<r.length;t++)r[t]=Math.random()*2-1}function R(){let r=4656612874161595e-25,t=1732584193,o=4023233417;return e=>{for(let n=0;n<e.length;n++)t^=o,e[n]=o*r,o+=t}}function M(r){let t=[0,0,0,0,0,0,0,0],o=[0,0,0,0,0,0,0,0],e=[0,0,0,0,0,0,0,0],n=0,h=0,a=c=>Math.pow(10,c/20),u=c=>20*Math.log10(c),l=0,i=0,p=0,m=r/(2*Math.PI)-1;for(;m>1;)t[l]=2*Math.PI*m/r,m=m/4,l++;for(h=l;l-- >0;)o[l]=a(i),p+=a(i),i-=6;return n=a(-u(p)),c=>{for(let f=0;f<c.length;f++){let b=Math.random()*2-1,d=0;for(let s=0;s<h;s++)e[s]=t[s]*b+(1-t[s])*e[s],d+=e[s]*o[s];c[f]=d*n}}}function P(){let r=[3.8024,2.9694,2.597,3.087,3.4006],t=[.00198,.01478,.06378,.23378,.91578],o=15.8564,e=[0,0,0,0,0],n=0;return h=>{for(let a=0;a<h.length;a++){let u=Math.random(),l=Math.random();for(let i=0;i<5;i++)if(u<t[i]){n-=e[i],e[i]=2*(l-.5)*r[i],n+=e[i];break}h[a]=n/o}}}var g=class extends AudioWorkletProcessor{r;t;d;constructor(){super(),this.r=!0,this.t=0,this.d=A(sampleRate,0),this.port.onmessage=t=>{switch(t.data.type){case"DISCONNECT":this.r=!1;break}}}process(t,o,e){return this.t!==e.type[0]&&(this.t=e.type[0],this.d=A(sampleRate,e.type[0])),this.d(o[0][0]),this.r}static get parameterDescriptors(){return[["type",0,0,100]].map(([t,o,e,n])=>({name:t,defaultValue:o,minValue:e,maxValue:n,automationRate:"k-rate"}))}};registerProcessor("NoiseWorkletProcessor",g);})();`;
