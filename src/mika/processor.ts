export const PROCESSOR = `(()=>{function b(t){return Object.keys(t).map(e=>{let{min:r,max:n,defaultValue:o}=t[e];return{name:e,minValue:r,maxValue:n,defaultValue:o,automationRate:"k-rate"}})}var h=Math.PI*2;function u(t,e){return t<e?(t/=e,t+t-t*t-1):t>1-e?(t=(t-1)/e,t*t+t+t+1):0}function l(t,e,r){let n=t<r?1:-1;return n+=u(t,e),n-=u((t+(1-r))%1,e),n}var y=2/4294967295;var P={wave:{min:0,max:5,defaultValue:1},frequency:{min:0,max:1e4,defaultValue:440},detune:{min:-100,max:100,defaultValue:.01}},m=class{constructor(e){this.sampleRate=e;this.osc=new d(e)}setParams(e,r,n){this.osc.setParams(e,r)}fillAudio(e){this.osc.fillAudio(e,1,!1)}},d=class{constructor(e){this.sampleRate=e;this.triLast=0;this.triCurrent=0;this.noiseValue=19.19191919191919;this.dt=1/e,this.phase=0}setParams(e,r){this.waveformType=e,this.freq=r}fillAudio(e,r,n){let o=this.phase,i=this.freq*this.dt;for(let s=0;s<e.length;s++){let a=r*this.process(o,i);e[s]=n?e[s]+a:a,o+=i,o>=1&&(o-=1)}this.phase=o}process(e,r){switch(this.waveformType){case 0:return Math.sin(this.phase*h);case 1:return this.triLast=this.triCurrent,this.triCurrent=r*l(this.phase,r,.5)+(1-r)*this.triLast,this.triCurrent*5;case 2:return 1-2*this.phase+u(this.phase,r);case 3:return l(this.phase,r,.5);case 4:return l(this.phase,r,.75);case 5:return this.noiseValue+=19,this.noiseValue*=this.noiseValue,this.noiseValue-=Math.floor(this.noiseValue),this.noiseValue-.5;default:return 0}}};var x=b(P),f=class extends AudioWorkletProcessor{constructor(){super();this.mika=new m(sampleRate)}process(r,n,o){let i=o.wave[0],s=o.freq[0],a=o.detune[0];this.mika.setParams(i,s,a);let p=n[0];for(let c=0;c<p.length;c++)this.mika.fillAudio(p[c]);return!0}static get parameterDescriptors(){return x}};registerProcessor("MikaWorklet",f);})();`;
