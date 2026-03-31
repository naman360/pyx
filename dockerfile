FROM public.ecr.aws/lambda/nodejs:18

WORKDIR /var/task

COPY docker/package.json ./
RUN npm install --omit=dev 

COPY scripts/lambda-function.js ./index.js

CMD ["index.handler"]
