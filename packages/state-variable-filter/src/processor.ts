export const PROCESSOR = `"use strict";(()=>{function P(r,t,a){return Math.max(t,Math.min(a,r))}function g(r,t=1){let a=1e3,u=.5,s=.5/r,l=2*Math.PI,F=2*r*s,x=0,e=0,d=0,f=0,m=0,i=0,c=0,h=0;function q(n){if(n.frequency[0]!==a||n.resonance[0]!==u){a=n.frequency[0],u=n.resonance[0];let p=P(a,16,r/2),o=1/P(u,.025,40);e=2*r*Math.tan(l*s*p)*s,x=1/(1+o*e+e*e),d=e+o}}function V(n,p,y){q(y);for(let o=0;o<n.length;o++)i=(n[o]-d*f-m)*x,c=e*i+f,h=e*c+m,f=e*i+c,m=e*c+h,p[o]=t===1?h:t===3?i:c}return{fill:V}}var b=class extends AudioWorkletProcessor{static parameterDescriptors=[{name:"frequency",defaultValue:1e3,minValue:16,maxValue:2e4,automationRate:"k-rate"},{name:"resonance",defaultValue:.5,minValue:0,maxValue:40,automationRate:"k-rate"}];u;r;constructor(){super(),this.u=g(sampleRate),this.r=!0,this.port.onmessage=t=>{switch(t.data.type){case"STOP":this.r=!1;break}}}process(t,a,u){let s=t[0][0],l=a[0][0];return s&&l&&this.u.fill(s,l,u),this.r}};registerProcessor("StateVariableFilterWorkletProcessor",b);})();`;
