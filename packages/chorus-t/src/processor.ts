export const PROCESSOR = `"use strict";(()=>{function P(r){let e=S(),o=S(),t=S(),s=S(),a=.5,c=.83,b=7,d=k(r,1,a,b),g=k(r,0,a,b),u=k(r,0,c,b),m=k(r,1,c,b),i=!0,h=!0;return{update(p,y,n,f){i=p===1,h=y===1,n!==a&&(a=n,d.setLfoRate(n),g.setLfoRate(n)),f!==c&&(c=f,u.setLfoRate(f),m.setLfoRate(f))},process(p,y){let n=p[0],f=p.length>1?p[1]:n;for(let l=0;l<n.length;l++){let L=n[l],R=f[l],x=L,A=R;i&&(x=e.process(d.process(x)),A=o.process(g.process(A))),h&&(x=t.process(u.process(x)),A=s.process(m.process(A))),y[0][l]=L+1.4*x,y[1][l]=R+1.4*A}}}}function S(){let r=0,e=0,t=.999-.01*.4;return{process(s){let a=s-r+t*e;return r=s,e=a,a}}}function F(r=.99){let e=r*.98,o=e*e*e*e,t=0,s=1/4294967295;return{tick(a){let c=1-o*a+o*t+s;return t=c,c}}}function k(r,e,o,t){let s=0,a=0,c=e*2-1,b=4*o/r,d=1,g=Math.floor(r*t*.001)+1,u=g+2e3,m=new Float32Array(u).fill(0),i=u-1,h=0,p=F(.99);function y(){return c>=1&&(d=-1),c<=-1&&(d=1),c+=d*b,c}return{setLfoRate(n){b=4*n/r},process(n){n=n*.2;let f=(.3*y()+.4)*g,l=i-Math.floor(f);l<0&&(l+=u);let L=l-1;L<0&&(L+=u);let R=f-Math.floor(f);return h=m[L]+m[l]*(1-R)-(1-R)*s,s=h,h=p.tick(h),m[i]=n,i++,i>=u&&(i=0),h}}}var C=class extends AudioWorkletProcessor{r;p;constructor(){super(),this.r=!0,this.p=P(sampleRate),this.port.onmessage=e=>{switch(e.data.type){case"DISPOSE":this.r=!1;break}}}process(e,o,t){if(!(e.length<1||o.length<1))if(t.bypass[0]===1){let s=e[0].length===1;o[0][1].set(e[0][0]),o[0][0].set(e[0][s?0:1])}else this.p.update(t.enable1[0],t.enable2[0],t.lfoRate1[0],t.lfoRate2[0]),this.p.process(e[0],o[0]);return this.r}static get parameterDescriptors(){return[["bypass",0,0,1],["enable1",1,0,1],["enable2",1,0,1],["lfoRate1",.5,0,1],["lfoRate2",.83,0,1]].map(([e,o,t,s])=>({name:e,defaultValue:o,minValue:t,maxValue:s,automationRate:"k-rate"}))}};registerProcessor("ChorusTWorkletProcessor",C);})();`;
