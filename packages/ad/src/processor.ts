export const PROCESSOR = `"use strict";(()=>{var M=class extends AudioWorkletProcessor{r;d;constructor(){super(),this.r=!0,this.d=O(sampleRate),this.port.onmessage=a=>{switch(a.data.type){case"DISPOSE":this.r=!1;break}}}process(a,n,t){return this.d.update(t.trigger[0],t.attack[0],t.decay[0]),this.d.gen(n[0][0],t.offset[0],t.gain[0]),this.r}static get parameterDescriptors(){return[["trigger",0,0,1],["attack",.01,0,10],["decay",.1,0,10],["offset",0,0,2e4],["gain",1,0,1e4]].map(([a,n,t,d])=>({name:a,defaultValue:n,minValue:t,maxValue:d,automationRate:"k-rate"}))}};registerProcessor("AdProcessor",M);function O(l){let D=l*.05,g=l*.1,u=!1,E=.1,f=.1,h=Math.exp(-1/(.1*D)),A=Math.exp(-1/(.1*g)),r=0,s=0;return{update(o,c,i){if(o===1?u||(u=!0,r=1):u=!1,c!==E){E=c;let e=Math.max(E*D,.001);h=Math.exp(-1/e)}if(i!==f){f=i;let e=Math.max(f*g,.001);A=Math.exp(-1/e)}},gen(o,c,i){let e=0;for(let p=0;p<o.length;p++)r===1?(e=h*s+(1-h),e-s<=5e-8&&(r=2),s=e):r===2?(e=A*s,s=e,e<=5e-8&&(r=0)):e=0,o[p]=c+e*i}}}})();`;
