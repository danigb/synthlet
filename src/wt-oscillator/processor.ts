export const PROCESSOR = `(()=>{function k(i){return Object.keys(i).map(e=>{let{min:t,max:r,init:n}=i[e];return{name:e,minValue:t,maxValue:r,defaultValue:n,automationRate:"k-rate"}})}function d(i){let e=i,t=i.length,r=0,n=0;function a(s){let c=Math.floor(r),b=r-c,f=s>0?c+1:c-1,P=f<0?t-1:f>=t?0:f,o=e[n+c],p=e[n+P],m=o+(p-o)*b;return r+=s,r>=t&&(r-=t),r<0&&(r+=t),m}function u(s,c){n=Math.floor(s??0),t=Math.floor(Math.min(c??t,e.length)),r=r%t}function l(s){r=s%t}return{read:a,set:l,window:u}}var h=class{constructor(e){this.max=e;this.prev=0,this.val=0}set(e){this.val=e%this.max}tick(e){return e<this.prev&&(this.val=(this.val+1)%this.max),this.prev=e,this.val}};var y=class{constructor(e,t=440){this.sampleRate=e;this.inc=t/this.sampleRate,this.phase=0}freq(e){this.inc=e/this.sampleRate}tick(e=1){for(this.phase+=e*this.inc;this.phase>=1;)this.phase-=1;for(;this.phase<=-1;)this.phase+=1;return this.phase}};var N={frequency:{min:0,max:2e4,init:440},morphFrequency:{min:0,max:10,init:.005}};function W(i){let e=new Float32Array(0),t=440,r=new y(i,.5),n=new h(0),a=0,u=0,l=d(e),s=d(e);function c(o){l.window(o%a*a,a),s.window((o+1)%a*a,a)}function b(o,p){a=Math.min(p,o.length),u=Math.floor(o.length/a),l=d(o),s=d(o),n=new h(u-1),c(n.val)}function f(o){t=o.frequency[0],u>0&&r.freq(o.morphFrequency[0])}function P(o){if(!l||!u||!a)return;let p=t/220;for(let m=0;m<o.length;m++){let x=r.tick(),w=l.read(p),S=s.read(p);o[m]=(1-x)*w+x*S;let g=n.val,O=n.tick(x);g!==O&&c(O)}return n.val}return{setWavetable:b,setParams:f,fillAudioMono:P}}var v=k(N),A=class extends AudioWorkletProcessor{constructor(){super();this.d=!1,this.p=W(sampleRate),this.port.onmessage=t=>{switch(t.data.type){case"DISCONNECT":this.d=!0;break;case"WAVE_TABLE":this.p.setWavetable(t.data.data,t.data.wavetableLength??256);break}}}process(t,r,n){return this.d?!1:(this.p.setParams(n),this.p.fillAudioMono(r[0][0]),!0)}static get parameterDescriptors(){return v}};registerProcessor("WtOscillatorWorklet",A);})();`;
