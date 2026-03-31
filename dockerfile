FROM public.ecr.aws/lambda/nodejs:18

WORKDIR /var/task

COPY docker/package.json ./
RUN npm install --omit=dev --os=linux --cpu=x64 --libc=glibc

COPY scripts/lambda-function.js ./index.js

CMD ["index.handler"]
