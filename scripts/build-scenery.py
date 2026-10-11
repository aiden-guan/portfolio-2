"""Prepares the photo scenes for the scenery versions of the portfolio.

Usage: python3 scripts/build-scenery.py <photos-dir> public/scenery

<photos-dir> holds cq.png (Chongqing), rk.png (Rockies) and sf.png (Golden
Gate). Each is downscaled to 512px wide and written as WebP, with a greyscale
PNG mask whose values name regions the scene animates: 1 water, 2 sky (and,
for Chongqing, the LED tower), 3 city lights or coastal scrub.
Needs Pillow and numpy.
"""
import sys, numpy as np
from PIL import Image
from collections import deque
W=512
def load(n):
    im=Image.open(f'{sys.argv[1]}/{n}.png').convert('RGB')
    im=im.resize((W,round(W*im.height/im.width)),Image.LANCZOS)
    a=np.asarray(im).astype(np.float32)/255
    return im,a
def grid(a):
    h,w,_=a.shape
    v,u=np.mgrid[0:h,0:w]
    return (u+.5)/w,(v+.5)/h
def lum(a): return a[...,0]*.2126+a[...,1]*.7152+a[...,2]*.0722
def flood(a,seedrows,ok):
    h,w,_=a.shape; m=np.zeros((h,w),bool); q=deque()
    for x in range(w):
        if ok[0,x]: m[0,x]=True; q.append((0,x))
    while q:
        y,x=q.popleft()
        for dy,dx in((1,0),(-1,0),(0,1),(0,-1)):
            yy,xx=y+dy,x+dx
            if 0<=yy<h and 0<=xx<w and not m[yy,xx] and ok[yy,xx] and np.abs(a[yy,xx]-a[y,x]).sum()<.09:
                m[yy,xx]=True; q.append((yy,xx))
    return m
out={}
# Chongqing
im,a=load('cq'); u,v=grid(a); L=lum(a)
m=np.zeros(L.shape,np.uint8)
m[(L>.55)&(v>.18)&(v<.9)]=3
m[(u>.775)&(u<.86)&(v>.08)&(v<.57)&(L>.45)]=2
water=(v>.893)&~((u>.15)&(u<.27))&~((u>.785)&(u<.905)&(v<.965))&(u>.035)
m[water]=1
out['chongqing']=(im,m)
# Rockies
im,a=load('rk'); u,v=grid(a); L=lum(a)
m=np.zeros(L.shape,np.uint8)
sky=flood(a,0,(v<.5))
m[sky]=2
r,g,b=a[...,0],a[...,1],a[...,2]
def uniform_filter(x,k):
    p=k//2; xp=np.pad(x,p,mode='edge'); c=np.cumsum(np.cumsum(xp,0),1); c=np.pad(c,((1,0),(1,0)))
    h,w=x.shape
    return (c[k:k+h,k:k+w]-c[0:h,k:k+w]-c[k:k+h,0:w]+c[0:h,0:w])/(k*k)
mu=uniform_filter(L,5); sd=np.sqrt(np.maximum(uniform_filter(L*L,5)-mu*mu,0))
from PIL import ImageDraw
pm=Image.new('L',(L.shape[1],L.shape[0]),0); d=ImageDraw.Draw(pm)
H,Wd=L.shape
P=lambda pts:[(x*Wd,y*H) for x,y in pts]
d.polygon(P([(.535,.555),(.6,.55),(.7,.575),(.85,.61),(1,.635),(1,.75),(.85,.765),(.79,.78),(.72,.745),(.65,.715),(.6,.68),(.56,.62)]),255)
d.polygon(P([(.08,1),(.12,.82),(.2,.75),(.3,.66),(.36,.62),(.44,.64),(.47,.68),(.6,.76),(.6,.86),(.5,.9),(.42,1)]),255)
poly=np.asarray(pm)>0
lake=poly&((sd<.035)|((u>.55)&(v<.79)))
m[lake]=1
out['rockies']=(im,m)
# SF
im,a=load('sf'); u,v=grid(a); L=lum(a)
r,g,b=a[...,0],a[...,1],a[...,2]
m=np.zeros(L.shape,np.uint8)
sky=flood(a,0,(v<.56)&(b>=r-.02))
m[sky]=2
water=(u>.29)&(v>.52)&(v<.82)&(b>r+.02)&(b>=g-.02)
m[water]=1
fol=(v>.5)&(g>b+.02)&~water
m[fol]=3
out['golden-gate']=(im,m)
import os
dst=sys.argv[2]
os.makedirs(dst,exist_ok=True)
for k,(im,m) in out.items():
    im.save(f'{dst}/{k}.webp',quality=82,method=6)
    Image.fromarray(m,'L').save(f'{dst}/{k}-mask.png',optimize=True)
