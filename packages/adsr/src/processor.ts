export const PROCESSOR = `"use strict";(()=>{function R(){let i=!1;return a=>{if(i===!1&&a>=.9)return i=!0,!0;if(i===!0&&a<.1)return i=!1,!1}}function D(i){let a=Math.exp(-1.5),n=Math.exp(-4.95),s=0,c=0,l=0,f=0,d={b:0,c:0},m={b:0,c:0},p={b:0,c:0},x=R(),b=0,e=0;return h(.01,.1,.5,.3),function(r,u){F(u);let o=u.offset[0],y=u.gain[0];for(let A=0;A<r.length;A++){switch(b){case 1:e=d.b+e*d.c,(e>=1||s<=0)&&(e=1,b=2);break;case 2:e=m.b+e*m.c,(e<=f||c<=0)&&(e=f,b=3);break;case 3:e=f;break;case 4:e=p.b+e*p.c,(e<=0||l<=0)&&(e=0,b=0)}r[A]=e*y+o}};function F(t){h(t.attack[0],t.decay[0],t.sustain[0],t.release[0]);let r=x(t.gate[0]);r===!0?b=1:r===!1&&(b=4)}function h(t,r,u,o){(f!==u||c!==r)&&(f=u,c=r,g(m,c,f,n)),s!==t&&(s=t,g(d,s,1+2*a,a)),l!==o&&(l=o,g(p,l,0,n))}function g(t,r,u,o){let y=r*i;t.c=Math.exp(-Math.log((1+o)/o)/y),t.b=(u-o)*(1-t.c)}}var k=class extends AudioWorkletProcessor{g;r=!0;constructor(a){super(),this.g=D(sampleRate),this.port.onmessage=n=>{switch(n.data.type){case"DISPOSE":this.r=!1;break}}}process(a,n,s){let c=n[0][0];return this.g(c,s),this.r}static get parameterDescriptors(){return[["gate",0,0,1],["attack",.01,0,10],["decay",.1,0,10],["sustain",.5,0,1],["release",.3,0,100],["offset",0,0,2e4],["gain",1,-2e4,2e4]].map(([a,n,s,c])=>({name:a,defaultValue:n,minValue:s,maxValue:c,automationRate:"k-rate"}))}};registerProcessor("AdsrProcessor",k);})();`;
