export const PROCESSOR = `"use strict";(()=>{function C(){let i=!1;return a=>{if(i===!1&&a>=.9)return i=!0,!0;if(i===!0&&a<.1)return i=!1,!1}}function x(i){let a=Math.exp(-1.5),c=Math.exp(-4.95),u=0,n=0,l=0,f=0,h=0,y=1,g={b:0,c:0},m={b:0,c:0},p={b:0,c:0},D=C(),b=0,t=0;return F(.01,.1,.5,.3),{agen:k,amod:P};function P(e,r,o){k(r,o);for(let s=0;s<r.length;s++)r[s]*=e[s]}function k(e,r){R(r);for(let o=0;o<e.length;o++){switch(b){case 1:t=g.b+t*g.c,(t>=1||u<=0)&&(t=1,b=2);break;case 2:t=m.b+t*m.c,(t<=f||n<=0)&&(t=f,b=3);break;case 3:t=f;break;case 4:t=p.b+t*p.c,(t<=0||l<=0)&&(t=0,b=0)}e[o]=t*y+h}}function R(e){let r=D(e.gate[0]);r===!0?b=1:r===!1&&(b=4),F(e.attack[0],e.decay[0],e.sustain[0],e.release[0]),h=e.offset[0],y=e.gain[0]}function F(e,r,o,s){f!==o&&(f=o,n=r,d(m,n,f,c)),u!==e&&(u=e,d(g,u,1+2*a,a)),n!==r&&(n=r,d(m,n,f,c)),l!==s&&(l=s,d(p,l,0,c))}function d(e,r,o,s){let $=r*i;e.c=Math.exp(-Math.log((1+s)/s)/$),e.b=(o-s)*(1-e.c)}}var A=class extends AudioWorkletProcessor{p;g;r=!0;constructor(a){super(),this.g=a?.processorOptions?.mode!=="modulator",this.p=x(sampleRate),this.port.onmessage=c=>{switch(c.data.type){case"DISCONNECT":this.r=!1;break}}}process(a,c,u){let n=c[0][0],l=a[0][0];return this.g?this.p.agen(n,u):l&&this.p.amod(l,n,u),this.r}static get parameterDescriptors(){return[["gate",0,0,1],["attack",.01,0,1],["decay",.1,0,1],["sustain",.5,0,1],["release",.3,0,1],["offset",0,0,2e4],["gain",1,-2e4,2e4]].map(([a,c,u,n])=>({name:a,defaultValue:c,minValue:u,maxValue:n,automationRate:"k-rate"}))}};registerProcessor("AdsrWorkletProcessor",A);})();`;