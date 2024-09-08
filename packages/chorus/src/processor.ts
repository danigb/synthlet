export const PROCESSOR = `"use strict";(()=>{function pt(i){let l=new Float32Array(65536),a=new Float32Array(65536),h=i,r=new Float32Array(2),t=new Float32Array(2),m=new Float32Array(2),p=new Float32Array(2),c=new Float32Array(2),n=new Float32Array(2),u=new Float32Array(2),f=new Float32Array(2),T=new Float32Array(2),y=new Float32Array(2),x=new Float32Array(2),o=new Float32Array(8192),e=0,w=new Int32Array(2),M=Math.min(192e3,Math.max(1,h)),v=Math.exp(-(44.12234/M)),D=1-v,ct=.33333334/M,ut=1/M,Tt=.14285715/M,yt=.5/M,xt=.25/M,At=.16666667/M,wt=.125/M,E=.5,G=.5,O=.5,L=.5;st(l,St),st(a,Vt);function Ft(F,I,k){let P=D*E,Rt=4.096*G,Ct=625e-7*O,bt=D*L;for(let A=0;A<F.length;A++){let W=F[A];w[0]=1,r[0]=P+v*r[1];let gt=W*r[0];o[e&8191]=gt,t[0]=Rt+.999*t[1],n[0]=Ct*t[0]+.999*n[1];let s=1-w[1];f[0]=bt+v*f[1];let j=s!==0?0:u[1]+ct*f[0];u[0]=j-Math.floor(j);let d=Math.min(4096,.375*t[0]+n[0]*l[Math.max(0,Math.min(Math.floor(65536*u[0]),65535))]),q=Math.floor(d),z=Math.floor(d),H=s!==0?0:T[1]+ut*f[0];T[0]=H-Math.floor(H);let R=Math.min(4096,.125*t[0]+n[0]*a[Math.max(0,Math.min(Math.floor(65536*T[0]),65535))]),J=Math.floor(R),K=Math.floor(R),N=W*(1-r[0]),Q=s!==0?0:y[1]+Tt*f[0];y[0]=Q-Math.floor(Q);let C=Math.min(4096,.875*t[0]-n[0]*l[Math.max(0,Math.min(Math.floor(65536*y[0]),65535))]),U=Math.floor(C),X=Math.floor(C);I[A]=.70710677*(o[e-Math.min(4097,Math.max(0,q))&8191]*(z+(1-d))+(d-z)*o[e-Math.min(4097,Math.max(0,q+1))&8191])+(R-J)*o[e-Math.min(4097,Math.max(0,K+1))&8191]+N+o[e-Math.min(4097,Math.max(0,K))&8191]*(J+(1-R))-.70710677*(o[e-Math.min(4097,Math.max(0,U))&8191]*(X+(1-C))+(C-X)*o[e-Math.min(4097,Math.max(0,U+1))&8191]);let Y=s!==0?0:x[1]+yt*f[0];x[0]=Y-Math.floor(Y);let Z=Math.max(0,Math.min(Math.floor(65536*x[0]),65535)),b=Math.min(4096,.25*t[0]+n[0]*(.70710677*a[Z]+.70710677*l[Z])),_=Math.floor(b),$=Math.floor(b),tt=s!==0?0:m[1]+xt*f[0];m[0]=tt-Math.floor(tt);let et=Math.max(0,Math.min(Math.floor(65536*m[0]),65535)),g=Math.min(4096,.5*t[0]+n[0]*(.70710677*l[et]-.70710677*a[et])),at=Math.floor(g),lt=Math.floor(g),ot=s!==0?0:p[1]+At*f[0];p[0]=ot-Math.floor(ot);let rt=Math.max(0,Math.min(Math.floor(65536*p[0]),65535)),S=Math.min(4096,.75*t[0]-n[0]*(.70710677*a[rt]+.70710677*l[rt])),ht=Math.floor(S),mt=Math.floor(S),nt=s!==0?0:c[1]+wt*f[0];c[0]=nt-Math.floor(nt);let ft=Math.max(0,Math.min(Math.floor(65536*c[0]),65535)),V=Math.min(4096,t[0]+n[0]*(.70710677*a[ft]-.70710677*l[ft])),it=Math.floor(V),Mt=Math.floor(V);k[A]=N-(.38268343*(o[e-Math.min(4097,Math.max(0,_))&8191]*($+(1-b))+(b-$)*o[e-Math.min(4097,Math.max(0,_+1))&8191])+.9238795*(o[e-Math.min(4097,Math.max(0,at))&8191]*(lt+(1-g))+(g-lt)*o[e-Math.min(4097,Math.max(0,at+1))&8191])+.9238795*(o[e-Math.min(4097,Math.max(0,ht))&8191]*(mt+(1-S))+(S-mt)*o[e-Math.min(4097,Math.max(0,ht+1))&8191])+.38268343*(o[e-Math.min(4097,Math.max(0,it))&8191]*(Mt+(1-V))+(V-Mt)*o[e-Math.min(4097,Math.max(0,it+1))&8191])),w[1]=w[0],r[1]=r[0],e=e+1>>>0,t[1]=t[0],n[1]=n[0],f[1]=f[0],u[1]=u[0],T[1]=T[0],y[1]=y[0],x[1]=x[0],m[1]=m[0],p[1]=p[0],c[1]=c[0]}}function dt(F,I,k,P){E=F,G=I,O=k,L=P}return{update:dt,compute:Ft}}var St=i=>Math.cos(958738e-10*i),Vt=i=>Math.sin(958738e-10*i);function st(i,l){if(i.length!==65536)throw new Error("Table must be 65536 samples long");let a=0,h=0,r=0,t=0;for(let m=0;m<65536;m++)a=1,r=(h+t)%65536,i[m]=Math.cos(958738e-10*r),h=a,t=r;return i}var B=class extends AudioWorkletProcessor{r;u;g;constructor(){super(),this.r=!0;let{compute:l,update:a}=pt(sampleRate);this.u=a,this.g=l,this.port.onmessage=h=>{switch(h.data.type){case"DISPOSE":this.r=!1;break}}}process(l,a,h){if(l[0].length===0)return this.r;this.u(h.delay[0],h.rate[0],h.depth[0],h.deviation[0]);let r=l[0][0],t=a[0][0],m=a[0][1];return this.g(r,t,m),this.r}static get parameterDescriptors(){return[["delay",.5,0,1],["rate",.5,0,1],["depth",.5,0,1],["deviation",.5,0,1]].map(([l,a,h,r])=>({name:l,defaultValue:a,minValue:h,maxValue:r,automationRate:"k-rate"}))}};registerProcessor("ChorusProcessor",B);})();`;
