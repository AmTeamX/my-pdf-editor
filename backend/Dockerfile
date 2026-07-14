FROM golang:latest AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go mod tidy && CGO_ENABLED=0 go build -o /pdf-editor-api .

FROM alpine:3.19

RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=builder /pdf-editor-api .

RUN mkdir -p uploads data

EXPOSE 8080

ENV PORT=8080
ENV UPLOAD_DIR=uploads

CMD ["./pdf-editor-api"]
