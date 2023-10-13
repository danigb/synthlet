export const PROCESSOR = `(()=>{function x(r){return Object.keys(r).map(e=>{let{min:t,max:o,init:n}=r[e];return{name:e,minValue:t,maxValue:o,defaultValue:n,automationRate:"k-rate"}})}var u=Math.PI,P=2*u,y=u*u;var L=4/u,F=-4/y;var s=5/12,c=Math.pow(10,-1/s),I=1/(1-c),E=1/(1+s*Math.log10(1+c)),V=1/(1+-Math.pow(10,-1/s)),O=s*Math.log10(1+c),j=1/(-s*Math.log10(c)+O);function m(r,e,t){return Math.max(e,Math.min(t,r))}function C(r){return 2*r-1}function M(r,e){return(e+r%e)%e}function S(r,e,t){return e+M(r-e,t-e)}var f=class{constructor(e){this.sampleRate=e;this.mcounter=0;this.phaseInc=0;this.phaseOffset=0;this.freqOffset=0;this.freqHz=0;this.mcounter=0,this.phaseOffset=0,this.freqOffset=0}setFrequency(e){this.freqHz=e,this.phaseInc=this.freqHz/this.sampleRate}addPhaseOffset(e,t){this.phaseOffset=e,this.phaseInc>0?this.mcounter+=e:this.mcounter-=e,t&&this.wrapClock()}removePhaseOffset(){this.phaseInc>0?this.mcounter+=-this.phaseOffset:this.mcounter-=-this.phaseOffset}advanceClock(e){this.mcounter+=e*this.phaseInc}wrapClock(){if(this.mcounter>=0&&this.mcounter<=1)return!1;let e=this.mcounter<0;return!e&&this.mcounter<2?this.mcounter-=1:e&&this.mcounter>-1?this.mcounter+=1:this.mcounter=S(this.mcounter,0,1),!0}};var a={waveform:1,frequency:440,pulseWidth:.5,mix:.5},k={waveform:{min:0,max:8,init:a.waveform},frequency:{min:0,max:1e4,init:a.frequency},mix:{min:0,max:1,init:a.mix},pulseWidth:{min:0,max:1,init:a.pulseWidth}},l=class{constructor(e){this.sampleRate=e;this.params={...a};this.triLast=0;this.triCurrent=0;this.noiseValue=19.19191919191919;this.oscClock=new f(e),this.params.waveform===7&&(this.oscClock.mcounter=.5)}setParams(e,t,o,n){this.params.waveform=m(Math.floor(e),0,3),this.oscClock.setFrequency(t),this.params.pulseWidth=m(o,0,1),this.params.mix=m(n,0,1)}renderAudio(e){if(e.length!==0)for(let t=0;t<e[0].length;t++){let o=this.render();this.oscClock.advanceClock(1),this.oscClock.wrapClock();for(let n=0;n<e.length;n++)e[n][t]=o}}render(){let{params:e}=this,{mcounter:t,phaseInc:o}=this.oscClock;if(e.waveform===0)return Math.sin(this.oscClock.mcounter*P);if(e.waveform===1)return this.triLast=this.triCurrent,this.triCurrent=o*p(t,o,.5)+(1-o)*this.triLast,this.triCurrent*5;if(e.waveform===2)return 1-2*t+d(t,o);if(e.waveform===3)return p(t,o,.5);if(e.waveform===4)return p(t,o,.75);if(e.waveform===5)return this.noiseValue+=19,this.noiseValue*=this.noiseValue,this.noiseValue-=Math.floor(this.noiseValue),this.noiseValue-.5;let n=w(this.oscClock);e.waveform,this.oscClock.addPhaseOffset(e.pulseWidth,!0);let i=w(this.oscClock),A=e.pulseWidth<.5?1/(1-e.pulseWidth):1/e.pulseWidth,b=(.5*n-.5*i)*A;if(this.oscClock.removePhaseOffset(),e.waveform===6)return b;if(e.waveform===8)return n*(1-e.mix)+b*e.mix;throw new Error("Invalid waveform")}};function w(r){let e=C(r.mcounter),t=0,o=1;return t=g(r.mcounter,Math.abs(r.phaseInc),o,!0),e+=t,e}function g(r,e,t,o){let n=0;if(r>1-e){let i=(r-1)/e;n=t*(i*i+2*i+1)}else if(r<e){let i=r/e;n=t*(2*i-i*i-1)}return o||(n*=-1),n}function d(r,e){return r<e?(r/=e,r+r-r*r-1):r>1-e?(r=(r-1)/e,r*r+r+r+1):0}function p(r,e,t){let o=r<t?1:-1;return o+=d(r,e),o-=d((r+(1-t))%1,e),o}var N=x(k),h=class extends AudioWorkletProcessor{constructor(){super();this.oscillator=new l(sampleRate)}process(t,o,n){this.oscillator.setParams(n.waveform[0],n.frequency[0],n.pulseWidth[0],n.mix[0]);let i=o[0];return this.oscillator.renderAudio(i),!0}static get parameterDescriptors(){return N}};registerProcessor("VaOscillatorWorklet",h);})();`;
