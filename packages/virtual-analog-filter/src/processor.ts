export const PROCESSOR = `"use strict";(()=>{function v(H,r){let R=0,m=0,l=0,c=0,o=0,t=0,e=[0,0],n=[0,0],f=[0,0];return m=Math.min(192e3,Math.max(1,H)),l=6.2831855/m,c=6/m,{update:h,process:r===1?a:s};function h(p,T){o=p,t=T}function s(p,T){let u=Math.tan(l*Math.pow(10,c*o+1)),d=u+1,i=u/d,w=9.293*t+-.00010678119,b=1-i,F=1/(1-.21521823*(u*w*b/d)),S=1/d,y=.21521823*w*b,x=2*i,g=.21521823*w;for(let A=0;A<p.length;A++){let C=p[A]-f[1],P=F*(f[1]+S*(u*C+y*e[1]-n[1]))-e[1],q=e[1]+i*P,O=q;e[0]=e[1]+x*P,n[0]=n[1]+x*(g*q-n[1]),f[0]=f[1]+x*C,T[A]=O,e[1]=e[0],n[1]=n[0],f[1]=f[0]}}function a(p,T){let u=Math.tan(l*Math.pow(10,c*o+1)),d=9.293*t+-.00010678119,i=u+1,w=u/i,b=1-.21521823*(u*d*(1-w)/i),F=1/b,S=1/i,y=2*w,x=.21521823*(d/b);for(let g=0;g<p.length;g++){let A=p[g],C=A-f[1],P=A-(f[1]+S*(u*C-e[1]+w*n[1])),q=F*P,O=x*P,K=O-n[1];e[0]=e[1]+y*(O-(w*K+e[1]+n[1])),n[0]=n[1]+y*K,f[0]=f[1]+y*C,T[g]=q,e[1]=e[0],n[1]=n[0],f[1]=f[0]}}}function E(H){let r=0,R=0,m=0,l=[0,0],c=[0,0],o=[0,0],t=[0,0];return R=3.1415927/Math.min(192e3,Math.max(1,H)),{update:e,process:n};function e(f,M){r=f,m=M}function n(f,M){let h=Math.tan(R*r),s=h+1,a=h/s,p=24.293*m+-.00010678119,T=.1646572*p*(1-a),u=1/(.1646572*(h*h*h*h*p/(s*s*s*s))+1),d=2*a;for(let i=0;i<f.length;i++){let w=u*(f[i]-T*(t[1]+a*(o[1]+a*(c[1]+a*l[1]))))-l[1];l[0]=l[1]+d*w;let b=l[1]+a*w-c[1];c[0]=c[1]+d*b;let F=c[1]+a*b-o[1];o[0]=o[1]+d*F;let S=o[1]+a*F-t[1];t[0]=t[1]+d*S;let y=t[1]+a*S;M[i]=y,l[1]=l[0],c[1]=c[0],o[1]=o[0],t[1]=t[0]}}}function I(H){let r=0,R=0,m=0,l=0,c=0,o=[0,0],t=[0,0],e=[0,0];return R=Math.min(192e3,Math.max(1,H)),m=6/R,l=6.2831855/R,{update:n,process:f};function n(M,h){r=M,c=h}function f(M,h){let s=Math.tan(l*Math.pow(10,m*r+1)),a=s+1,p=s/a,T=2*p,u=T+-1,d=.0823286*(s*u/a),i=.0823286*u,w=24.293*c+-.00010678119,b=w/a,F=1/(.0823286*(s*s*w*u/(a*a))+1);for(let S=0;S<M.length;S++){let y=F*(M[S]-b*(.1646572*o[1]+i*t[1]+d*e[1]))-e[1],x=e[1]+p*y-t[1],g=t[1]+p*x,A=g-o[1];o[0]=o[1]+T*A,t[0]=t[1]+T*x,e[0]=e[1]+T*y;let C=2*(o[1]+p*A)-g;h[S]=C,o[1]=o[0],t[1]=t[0],e[1]=e[0]}}}function k(H,r){let R=0,m=0,l=0,c=0,o=0,t=[0,0],e=[0,0];return R=Math.min(192e3,Math.max(1,H)),m=6.2831855/R,l=6/R,r=r,{update:n,process:f};function n(M,h){c=M,o=h}function f(M,h){let s=Math.tan(m*Math.pow(10,l*c+1)),a=1/(29.293*o+.707)+s,p=s*a+1,T=s/p,u=1/p,d=2*s;for(let i=0;i<M.length;i++){let w=M[0]-(t[1]+a*e[1]),b=T*w,F=Math.max(-1,Math.min(1,e[1]+b)),S=F*(1-.33333334*(F*F)),y=s*S,x=t[1]+y,g=u*w,A=g,C=S,P=y+t[1]+g;t[0]=t[1]+d*S,e[0]=b+S,h[i]=r==1?A:r==2?C:r==3?P:x,t[1]=t[0],e[1]=e[0]}}}var D=class extends AudioWorkletProcessor{r;t;p;d;constructor(){super(),this.r=!0,this.p=[E(sampleRate),I(sampleRate),v(sampleRate,0),v(sampleRate,1),k(sampleRate,0),k(sampleRate,1),k(sampleRate,2),k(sampleRate,3)],this.t=0,this.d=this.p[0],this.port.onmessage=r=>{switch(r.data.type){case"DISPOSE":this.r=!1;break}}}process(r,R,m){let l=Math.floor(m.type);return this.t!==l&&(this.t=l,this.d=this.p[l]||this.p[0]),r[0].length===0?this.r:(this.d.update(m.frequency[0],m.resonance[0]),this.d.process(r[0][0],R[0][0]),this.r)}static get parameterDescriptors(){return[["type",0,0,7],["frequency",1e3,20,2e4],["Q",.8,0,1]].map(([r,R,m,l])=>({name:r,defaultValue:R,minValue:m,maxValue:l,automationRate:"k-rate"}))}};registerProcessor("VAFProcessor",D);})();`;
